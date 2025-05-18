// ✅ 전역 상태 변수들
let popupButton;
let latestSelectedText = "";
let isMouseDown = false;
let dragStartX = 0;
let dragStartY = 0;
let popupHideTimeout = null; // ✅ 추가: 자동 숨김 타이머

// ✅ 스타일 삽입
(function injectGearStyle() {
  const style = document.createElement("style");
  style.textContent = `
    .gear-icon {
      margin-left: 6px;
      font-size: 16px;
      display: none;
    }
    .rotate {
      animation: rotate-gear 1s linear infinite;
    }
    @keyframes rotate-gear {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
})();

// ✅ 분석 수행
async function fetchAnalysisAndShowCard(text) {
  try {
    const spinner = popupButton?.querySelector('#scope-spinner');
    if (spinner) spinner.style.display = 'inline-block';
    if (spinner) spinner.classList.add('rotate');

    const analysis = await fetch("http://127.0.0.1:8000/analyze-comment-full", {
      method: "POST",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify({
        comment: text,
        url: window.location.href
      })
    })
    const analysisFullData = await analysis.json();

    const relatedNewsTitle = analysisFullData.news.length > 0 ? analysisFullData.news[0].title : "관련 뉴스 없음";
    const relatedNewsUrl = analysisFullData.news.length > 0 ? analysisFullData.news[0].url : "https://news.google.com";

    showCard(text, analysisFullData.opinion, analysisFullData.opposition, relatedNewsTitle, relatedNewsUrl, analysisFullData.summary);
  } catch (err) {
    console.error("❌ 분석 중 오류:", err);
    showCard(text, "AI 분석 실패", "서버를 확인해주세요", "뉴스 로딩 실패", "https://news.google.com", "페이지 요약 실패");
  } finally {
    const spinner = popupButton?.querySelector('#scope-spinner');
    if (spinner) spinner.classList.remove('rotate');
    if (spinner) spinner.style.display = 'none';
  }
}

// 카드 생성
function showCard(originalText, core, counter, newsTitle, newsUrl, summary) {
  const card = document.createElement('div');
  card.className = 'mirrorscope-card';
  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <strong>✅ 선택한 문장:</strong>
      <button class="mirrorscope-close" style="background: transparent; border: none; font-size: 18px; cursor: pointer;">❌</button>
    </div>
    <p>"${originalText}"</p>
    <strong>🧾 원문 내용:</strong>
    <p class="news-summary">${summary}</p>
    <strong>🔍 핵심 주장:</strong>
    <p>${core}</p>
    <strong>↔️ 다른 시선:</strong>
    <p class="clickable clickable-counter">${counter}</p>
    <strong>📰 관련 기사:</strong>
    <p class="news-link" style="color: blue; text-decoration: underline; cursor: pointer;">${newsTitle}</p>
  `;
  const offset = document.querySelectorAll('.mirrorscope-card').length * 30;
  card.style.top = `${100 + offset}px`;
  card.style.left = `${100 + offset}px`;
  document.body.appendChild(card);
  makeCardDraggable(card);

  card.querySelector('.mirrorscope-close').addEventListener('click', () => card.remove());

  const counterEl = card.querySelector('.clickable-counter');
  if (counterEl) counterEl.addEventListener('click', () => fetchAnalysisAndShowCard(counterEl.innerText));

  const newsEl = card.querySelector('.news-link');
  if (newsEl) newsEl.addEventListener('click', () => window.open(newsUrl, "_blank"));
}

// ✅ 버튼 생성 및 위치 조정 + 타이머
function createOrUpdatePopupButton(x, y) {
  if (!popupButton) {
    popupButton = document.createElement('div');
    popupButton.id = 'mirrorscope-button';

    Object.assign(popupButton.style, {
      position: 'absolute',
      display: 'inline-flex',
      alignItems: 'center',
      background: '#0066ff',
      color: 'white',
      padding: '6px 10px',
      borderRadius: '6px',
      fontSize: '15px',
      fontFamily: 'sans-serif',
      cursor: 'pointer',
      zIndex: '99999'
    });

    const label = document.createElement('span');
    label.textContent = 'SCOPE';
    const spinner = document.createElement('span');
    spinner.id = 'scope-spinner';
    spinner.className = 'gear-icon';
    spinner.textContent = '⚙️';

    popupButton.appendChild(label);
    popupButton.appendChild(spinner);
    document.body.appendChild(popupButton);

    popupButton.addEventListener('click', () => {
      if (popupHideTimeout) clearTimeout(popupHideTimeout); // ✅ 자동 사라짐 중지
      popupButton.style.pointerEvents = 'none';
      popupButton.style.opacity = '0.6';

      fetchAnalysisAndShowCard(latestSelectedText).finally(() => {
        popupButton.style.pointerEvents = 'auto';
        popupButton.style.opacity = '1';
        popupButton.style.display = 'none';
      });
    });
  }

  popupButton.style.top = `${y}px`;
  popupButton.style.left = `${x}px`;
  popupButton.style.display = 'inline-flex';

  if (popupHideTimeout) clearTimeout(popupHideTimeout);
  popupHideTimeout = setTimeout(() => {
    if (popupButton) popupButton.style.display = 'none';
  }, 2000); // ✅ 2초 후 사라짐
}

// ✅ 마우스 드래그 감지
let dragThreshold = 10;
let dragDetected = false;

document.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  dragStartX = e.pageX;
  dragStartY = e.pageY;
  dragDetected = false;
});

document.addEventListener('mousemove', (e) => {
  if (isMouseDown) {
    const dx = e.pageX - dragStartX;
    const dy = e.pageY - dragStartY;
    if (!dragDetected && Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
      dragDetected = true;
    }
  }
});

document.addEventListener('mouseup', (e) => {
  isMouseDown = false;
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0 && dragDetected) {
    latestSelectedText = selectedText;
    createOrUpdatePopupButton(e.pageX, e.pageY);
  }
});

// ✅ 카드 드래그
function makeCardDraggable(card) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  card.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - card.getBoundingClientRect().left;
    offsetY = e.clientY - card.getBoundingClientRect().top;
    card.style.cursor = 'move';
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      card.style.left = `${e.clientX - offsetX}px`;
      card.style.top = `${e.clientY - offsetY}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    card.style.cursor = 'default';
  });
}
