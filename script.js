/* 비주얼노벨 게임 엔진 - 반응형 버전 */

// 상태 변수
let sceneIndex = {};
let currentChapter = null;
let currentSceneIndex = 0;
let scriptData = null;
let lineIndex = 0;
let charCount = 0;
let firstLineOfScene = true;
let busy = false;
let isTyping = false;
let skipRequested = false;
let typingTimeoutId = null;

const CHAR_LIMIT = 200; // 텍스트 제한을 더 늘림
const TYPING_SPEED = 15; // 타이핑 속도를 더 빠르게

// DOM 요소
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

// 이벤트 리스너
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

elGame.addEventListener("click", (e) => {
  e.stopPropagation();
  if (elGame.classList.contains("hidden")) return;
  if (!elSettings.classList.contains("hidden")) return;
  
  if (isTyping) {
    skipRequested = true;
  } else {
    requestNext();
  }
});

// 화면 흔들림 함수
function performShake(intensity) {
  return new Promise((resolve) => {
    const gameContent = document.querySelector('.game-content');
    if (!gameContent) {
      resolve();
      return;
    }

    // 기존 흔들림 클래스 제거
    gameContent.classList.remove('shake-1-25', 'shake-26-50', 'shake-51-75', 'shake-76-100');
    
    // 강도에 따라 적절한 클래스 선택
    let shakeClass;
    if (intensity <= 25) {
      shakeClass = 'shake-1-25';
    } else if (intensity <= 50) {
      shakeClass = 'shake-26-50';
    } else if (intensity <= 75) {
      shakeClass = 'shake-51-75';
    } else {
      shakeClass = 'shake-76-100';
    }
    
    // 흔들림 시작
    gameContent.classList.add(shakeClass);
    
    // 애니메이션 완료 후 클래스 제거 (충격 효과에 맞춘 지속시간)
    const duration = shakeClass === 'shake-1-25' ? 400 : 
                    shakeClass === 'shake-26-50' ? 600 :
                    shakeClass === 'shake-51-75' ? 800 : 1000;
    
    setTimeout(() => {
      gameContent.classList.remove(shakeClass);
      resolve();
    }, duration);
  });
}

// 유틸리티 함수
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
  busy = false;
  isTyping = false;
  skipRequested = false;
  
  if (typingTimeoutId) {
    clearTimeout(typingTimeoutId);
    typingTimeoutId = null;
  }
  
  elTextArea.innerHTML = "";
  elCharacter.innerHTML = "";
  // 캐릭터 위치 클래스도 초기화
  elCharacter.classList.remove('pos-left', 'pos-center', 'pos-right');
}

// 씬 관리
async function loadSceneIndex() {
  try {
    const res = await fetch("scenes.json");
    if (!res.ok) throw new Error("scenes.json not found");
    sceneIndex = await res.json();
  } catch (err) {
    console.error("scenes.json 로드 실패:", err);
    // 데모 데이터 사용
    sceneIndex = {
      "01": ["01_001.json", "01_002.json"],
      "02": ["02_001.json"]
    };
  }
}

async function loadScript(chapterKey, sceneIdx) {
  const fileName = sceneIndex?.[chapterKey]?.[sceneIdx];
  
  if (!fileName) {
    const chapters = Object.keys(sceneIndex).sort();
    const idx = chapters.indexOf(chapterKey);
    const nextChapter = chapters[idx + 1];
    
    if (nextChapter && nextChapter !== chapterKey) {
      currentChapter = nextChapter;
      currentSceneIndex = 0;
      await loadScript(currentChapter, currentSceneIndex);
      return;
    } else {
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

    lineIndex = 0;
    charCount = 0;
    firstLineOfScene = true;
    
    const firstLine = scriptData.lines?.[0];
    if (firstLine) {
      if (firstLine.bg) elBackground.style.backgroundImage = `url(${firstLine.bg})`;
      if (firstLine.char) {
        elCharacter.innerHTML = `<img src="${firstLine.char}" alt="char">`;
        // 첫 번째 라인의 위치 설정
        if (firstLine.pos) {
          elCharacter.classList.remove('pos-left', 'pos-center', 'pos-right');
          elCharacter.classList.add(`pos-${firstLine.pos}`);
        } else {
          elCharacter.classList.add('pos-center');
        }
      } else if (firstLine.char === "") {
        elCharacter.innerHTML = "";
      }
    } else {
      elCharacter.innerHTML = "";
    }

    setFadeOpacity("1", true);
    elTextArea.innerHTML = "";
    
    await showNext();
    
  } catch (err) {
    console.error("씬 로드 실패:", err);
    currentSceneIndex++;
    await loadScript(currentChapter, currentSceneIndex);
  }
}

// 게임 로직
async function startGame() {
  elMain.classList.add("hidden");
  elGame.classList.remove("hidden");
  
  setFadeOpacity("1", true);
  
  await loadSceneIndex();
  const chapters = Object.keys(sceneIndex).sort();
  
  if (chapters.length === 0) {
    console.error("씬 데이터가 없습니다");
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
  if (busy) return;
  busy = true;

  try {
    if (!scriptData?.lines || lineIndex >= scriptData.lines.length) {
      await endScene();
      return;
    }

    const line = scriptData.lines[lineIndex];

    // 강제 초기화 처리
    if (line.clear === true) {
      elTextArea.innerHTML = "";
      charCount = 0;
      lineIndex++;
      busy = false;
      await showNext(); // 다음 라인으로 즉시 진행
      return;
    }

    // 화면 흔들림 처리
    if (line.shake && typeof line.shake === 'number' && line.shake >= 1 && line.shake <= 100) {
      await performShake(line.shake);
      lineIndex++;
      busy = false;
      await showNext(); // 다음 라인으로 즉시 진행
      return;
    }

    // 배경 업데이트
    if (line.bg) elBackground.style.backgroundImage = `url(${line.bg})`;
    
    // 캐릭터 업데이트 (이미지와 위치)
    if (line.char) {
      elCharacter.innerHTML = `<img src="${line.char}" alt="char">`;
    } else if (line.char === "") {
      elCharacter.innerHTML = "";
    }
    
    // 캐릭터 위치 설정 (pos 속성)
    if (line.pos) {
      // 기존 위치 클래스 제거
      elCharacter.classList.remove('pos-left', 'pos-center', 'pos-right');
      // 새로운 위치 클래스 추가
      elCharacter.classList.add(`pos-${line.pos}`);
    } else if (!elCharacter.classList.contains('pos-left') && 
               !elCharacter.classList.contains('pos-right') && 
               !elCharacter.classList.contains('pos-center')) {
      // 위치가 지정되지 않은 경우 기본값으로 중앙 설정
      elCharacter.classList.add('pos-center');
    }

    if (firstLineOfScene) {
      await fadeIn();
      firstLineOfScene = false;
    }

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
    
    element.style.opacity = "1";
    element.style.transform = "none";

    if (typingTimeoutId) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }

    if (!text || text.trim() === "") {
      isTyping = false;
      resolve();
      return;
    }

    let currentIndex = 0;
    
    function typeNextChar() {
      if (skipRequested) {
        if (typingTimeoutId) {
          clearTimeout(typingTimeoutId);
          typingTimeoutId = null;
        }
        
        element.textContent = text;
        isTyping = false;
        skipRequested = false;
        resolve();
        return;
      }

      if (currentIndex >= text.length) {
        if (typingTimeoutId) {
          clearTimeout(typingTimeoutId);
          typingTimeoutId = null;
        }
        isTyping = false;
        resolve();
        return;
      }

      const char = text.charAt(currentIndex);
      element.textContent += char;
      currentIndex++;
      
      let delay = TYPING_SPEED;
      
      if (char === '.' || char === '!' || char === '?' || 
          char === '…' || char === '。') {
        delay = TYPING_SPEED * 3;
      } else if (char === ',' || char === '、') {
        delay = TYPING_SPEED * 2;
      }

      typingTimeoutId = setTimeout(typeNextChar, delay);
    }
    
    typeNextChar();
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