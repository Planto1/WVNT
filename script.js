/* 비주얼노벨 게임 엔진 - 최적화 버전 */

///// 상태 변수
let sceneIndex = {};
let currentChapter = null;
let currentSceneIndex = 0;
let scriptData = null;
let lineIndex = 0;
let charCount = 0;
let firstLineOfScene = true;
let isTyping = false;
let skipRequested = false;
let busy = false;
let typingTimeoutId = null;

const TYPING_MS = 0;
const CHAR_LIMIT = 300;

///// DOM 요소
const elMain = document.getElementById("main-menu");
const elGame = document.getElementById("game-screen");
const elBackground = document.getElementById("background");
const elCharacter = document.getElementById("character");
const elFade = document.getElementById("fadeLayer");
const elTextArea = document.getElementById("text-area");
const elSettings = document.getElementById("settings");
const btnStart = document.getElementById("btn-start");
const btnSettings = document.getElementById("btn-settings");
const btnCloseSettings = document.getElementById("btn-close-settings");
const btnExitToMenu = document.getElementById("btn-exit-to-menu");

///// 이벤트 리스너
btnStart.addEventListener("click", (e) => {
  e.stopPropagation();
  startGame();
});

btnSettings.addEventListener("click", (e) => {
  e.stopPropagation();
  elSettings.classList.remove("hidden");
});

btnCloseSettings.addEventListener("click", (e) => {
  e.stopPropagation();
  elSettings.classList.add("hidden");
});

btnExitToMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  elSettings.classList.add("hidden");
  elGame.classList.add("hidden");
  elMain.classList.remove("hidden");
  resetGame();
});

// 게임 화면에서만 클릭 처리
elGame.addEventListener("click", (e) => {
  e.stopPropagation();
  if (elGame.classList.contains("hidden")) return;
  if (!elSettings.classList.contains("hidden")) return;
  requestNext();
});

///// 유틸리티 함수
function setFadeOpacity(value, instant = false) {
  if (!elFade) return;
  if (instant) {
    const prev = elFade.style.transition;
    elFade.style.transition = "none";
    elFade.style.opacity = value;
    void elFade.offsetHeight;
    elFade.style.transition = prev || "opacity 1s ease";
  } else {
    elFade.style.opacity = value;
  }
}

function resetGame() {
  scriptData = null;
  lineIndex = 0;
  charCount = 0;
  firstLineOfScene = true;
  isTyping = false;
  skipRequested = false;
  busy = false;
  if (typingTimeoutId) {
    clearTimeout(typingTimeoutId);
    typingTimeoutId = null;
  }
  elTextArea.innerHTML = "";
  elCharacter.innerHTML = "";
}

///// 씬 관리
async function loadSceneIndex() {
  try {
    const res = await fetch("scenes.json");
    if (!res.ok) throw new Error("scenes.json not found");
    sceneIndex = await res.json();
  } catch (err) {
    console.error("scenes.json 로드 실패:", err);
    sceneIndex = {};
  }
}

async function loadScript(chapterKey, sceneIdx) {
  const fileName = sceneIndex?.[chapterKey]?.[sceneIdx];
  
  if (!fileName) {
    // 다음 챕터 시도
    const chapters = Object.keys(sceneIndex).sort();
    const idx = chapters.indexOf(chapterKey);
    const nextChapter = chapters[idx + 1];
    
    if (nextChapter && nextChapter !== chapterKey) {
      currentChapter = nextChapter;
      currentSceneIndex = 0;
      await loadScript(currentChapter, currentSceneIndex);
      return;
    } else {
      // 게임 종료
      elGame.classList.add("hidden");
      elMain.classList.remove("hidden");
      resetGame();
      return;
    }
  }

  try {
    const res = await fetch(fileName);
    if (!res.ok) throw new Error("파일 없음: " + fileName);
    scriptData = await res.json();

    // 씬 초기화
    lineIndex = 0;
    charCount = 0;
    firstLineOfScene = true;
    
    // 배경/캐릭터 미리 설정
    const firstLine = scriptData.lines?.[0];
    if (firstLine) {
      if (firstLine.bg) elBackground.style.backgroundImage = `url(${firstLine.bg})`;
      if (firstLine.char) elCharacter.innerHTML = `<img src="${firstLine.char}" alt="char">`;
      else if (firstLine.char === "") elCharacter.innerHTML = "";
    } else {
      elCharacter.innerHTML = "";
    }

    setFadeOpacity("1", true); // 검정 상태로 시작
    elTextArea.innerHTML = "";
    
    await showNext();
    
  } catch (err) {
    console.error("씬 로드 실패:", err);
    // 다음 씬으로 스킵
    currentSceneIndex++;
    await loadScript(currentChapter, currentSceneIndex);
  }
}

///// 게임 로직
async function startGame() {
  elMain.classList.add("hidden");
  elGame.classList.remove("hidden");
  
  setFadeOpacity("1", true);
  
  await loadSceneIndex();
  const chapters = Object.keys(sceneIndex).sort();
  
  if (chapters.length === 0) {
    console.error("scenes.json이 비어있음");
    elGame.classList.add("hidden");
    elMain.classList.remove("hidden");
    return;
  }
  
  currentChapter = chapters[0];
  currentSceneIndex = 0;
  await loadScript(currentChapter, currentSceneIndex);
}

function requestNext() {
  showNext();
}

async function showNext() {
  if (busy) {
    if (isTyping) skipRequested = true;
    return;
  }
  busy = true;

  try {
    if (!scriptData?.lines || lineIndex >= scriptData.lines.length) {
      await endScene();
      return;
    }

    const line = scriptData.lines[lineIndex];

    // 배경/캐릭터 업데이트
    if (line.bg) elBackground.style.backgroundImage = `url(${line.bg})`;
    if (line.char) {
      elCharacter.innerHTML = `<img src="${line.char}" alt="char">`;
    } else if (line.char === "") {
      elCharacter.innerHTML = "";
    }

    // 첫 줄이면 fadeIn
    if (firstLineOfScene) {
      await fadeIn();
      firstLineOfScene = false;
    }

    // 텍스트 처리
    const txt = (line.text || "").toString();
    if (charCount + txt.length > CHAR_LIMIT) {
      elTextArea.innerHTML = "";
      charCount = 0;
    }
    charCount += txt.length;

    const lineEl = document.createElement("div");
    lineEl.className = "line";
    elTextArea.appendChild(lineEl);

    await typeText(lineEl, txt);
    lineIndex++;
    
  } finally {
    busy = false;
  }
}

function typeText(element, text) {
  return new Promise((resolve) => {
    isTyping = true;
    skipRequested = false;
    element.textContent = "";

    if (typingTimeoutId) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }

    if (!text) {
      element.classList.add("show");
      isTyping = false;
      resolve();
      return;
    }

    let i = 0;
    function step() {
      if (skipRequested) {
        if (typingTimeoutId) {
          clearTimeout(typingTimeoutId);
          typingTimeoutId = null;
        }
        element.textContent = text;
        element.classList.add("show");
        isTyping = false;
        resolve();
        return;
      }

      if (i < text.length) {
        element.textContent += text.charAt(i++);
        typingTimeoutId = setTimeout(step, TYPING_MS);
      } else {
        element.classList.add("show");
        isTyping = false;
        typingTimeoutId = null;
        resolve();
      }
    }
    step();
  });
}

async function endScene() {
  await fadeOut();
  currentSceneIndex++;
  await loadScript(currentChapter, currentSceneIndex);
}

function fadeIn() {
  return new Promise((resolve) => {
    setFadeOpacity("0.5", false);
    setTimeout(() => resolve(), 1000);
  });
}

function fadeOut() {
  return new Promise((resolve) => {
    setFadeOpacity("1", false);
    setTimeout(() => {
      elTextArea.innerHTML = "";
      resolve();
    }, 1000);
  });
}

// 초기화
setFadeOpacity("1", true);