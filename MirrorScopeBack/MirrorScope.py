from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List
import google.generativeai as genai
import requests
from bs4 import BeautifulSoup
import json
import re
from dotenv import load_dotenv
import os

load_dotenv()  # 🔥 .env 파일 로드

# ✅ Gemini 설정
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel(os.getenv("GEMINI_MODEL"))

# ✅ FastAPI 앱
app = FastAPI()

# ✅ CORS 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ 요청 모델
class TextRequest(BaseModel):
    text: str

class CommentRequest(BaseModel):
    comment: str

class UrlRequest(BaseModel):
    url: str

class AnalyzeFullRequest(BaseModel):
    url: str
    comment: str

@app.post("/analyze-comment-full")
def analyze_comment_full(data: AnalyzeFullRequest):
    url = data.url.strip()
    comment = data.comment.strip()

    # 1. 페이지 요약
    context_summary = summarize_with_url(url)

    # 2. 댓글 분석 (핵심 주장 + 반대 시선)
    analysis_prompt = f"""
너는 중립적이고 균형 잡힌 인공지능이다. 다음 문장을 읽고:
1. 핵심 주장(opinion)을 요약하고,
2. 반대 시선(opposition)을 함께 제시해.

문장: "{comment}"
[참고 요약]: {context_summary}

결과는 다음 JSON 형식으로 만들어줘:
{{
  "opinion": "...",
  "opposition": "..."
}}
"""
    parsed_analysis = safe_extract_json(model.generate_content(analysis_prompt).text, "분석")

    # 3. 뉴스 키워드 생성 및 링크 반환
    news_prompt = f"""
다음 문장을 뉴스 검색어로 바꿔줘. 한국 사회 이슈 위주로 짧고 명확한 핵심 키워드만 남기고,
JSON 형식으로 응답해줘. 예시: {{ "query": "여성 징병제 논란" }}

문장: "{comment}"
[참고 요약]: {context_summary}

주의: 설명 없이 JSON만 반환해줘.
"""
    query_obj = safe_extract_json(model.generate_content(news_prompt).text, "뉴스")
    query = query_obj.get("query", "")
    news = [
        {
            "title": f"🔍 관련 뉴스: {query}",
            "url": f"https://www.google.com/search?q={query}&tbm=nws"
        }
    ] if query else [
        {
            "title": "🔍 관련 뉴스 검색 결과 보기",
            "url": f"https://www.google.com/search?q={comment}&tbm=nws"
        }
    ]

    return {
        "summary": context_summary,
        "opinion": parsed_analysis.get("opinion"),
        "opposition": parsed_analysis.get("opposition"),
        "news": news
    }

def summarize_with_url(url: str) -> str:
    if any(bad in url for bad in ["google.com/search", "search.naver.com", "youtube.com/results"]):
        return "검색 결과 페이지는 요약할 수 없습니다."
    if "youtube.com/watch" in url or "youtu.be/" in url:
        return summarize_youtube(url).get("summary", "")
    return summarize_url(url).get("summary", "")

def summarize_url(url: str) -> Dict[str, str]:
    try:
        headers = { "User-Agent": "Mozilla/5.0" }
        res = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(res.text, "html.parser")

        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        blocks = soup.find_all(["p", "div", "section", "article"])
        text_chunks = [block.get_text(separator=" ", strip=True) for block in blocks if len(block.get_text(strip=True)) >= 100]
        text = re.sub(r'\s+', ' ', " ".join(text_chunks))

        if len(text) < 200:
            return {"summary": "본문이 충분하지 않아 요약할 수 없습니다."}

        prompt = f"""
다음은 웹 페이지 본문입니다. 광고나 반복 문구는 무시하고 핵심 내용을 3줄 이내로 요약해줘:

{text[:4000]}
"""
        response = model.generate_content(prompt)
        return {"summary": response.text.strip()}

    except Exception as e:
        print("❌ 페이지 요약 오류:", e)
        return {"summary": "페이지 요약 중 오류가 발생했습니다."}

def summarize_youtube(youtube_url: str) -> Dict[str, str]:
    try:
        print("🔥 [유튜브 요약 시작] URL:", youtube_url)
        oembed_url = f"https://www.youtube.com/oembed?url={youtube_url}&format=json"
        res = requests.get(oembed_url)
        if res.status_code != 200:
            print("❌ oEmbed 응답 실패:", res.status_code)
            return {"summary": "유튜브 영상 정보를 불러올 수 없습니다."}

        data = res.json()
        title = data.get("title", "").strip()
        if not title:
            return {"summary": "제목 정보가 없습니다."}

        prompt = f"""
다음은 유튜브 영상의 제목입니다. 영상의 내용을 3줄 이내로 중립적으로 요약해줘.

제목: {title}
"""
        response = model.generate_content(prompt)
        return {"summary": response.text.strip()}

    except Exception as e:
        print("❌ 유튜브 요약 오류:", e)
        return {"summary": "유튜브 영상 요약 중 오류가 발생했습니다."}

def safe_extract_json(text: str, context: str = "") -> Dict[str, str]:
    try:
        match = re.search(r'\{[\s\S]*?\}', text)
        return json.loads(match.group()) if match else {}
    except Exception as e:
        print(f"❌ {context} JSON 파싱 오류:", e)
        return {}


