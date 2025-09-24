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

// 오디오 관리 변수
let audioElements = new Map(); // 오디오 파일 캐시
let currentAudio = null; // 현재 재생 중인 오디오

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

// 키보드 이벤트 리스너 추가
document.addEventListener("keydown", (e) => {
  // 게임 화면이 보이고 설정창이 닫혀있을 때만 엔터키 처리
  if (!elGame.classList.contains("hidden") && elSettings.classList.contains("hidden")) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isTyping) {
        skipRequested = true;
      } else {
        requestNext();
      }
    }
  }
});

// 오디오 관리 함수
function playAudio(audioPath, loops = 1) {
  return new Promise((resolve) => {
    try {
      // 기존 오디오가 재생 중이면 정지
      if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      // 캐시에서 오디오 엘리먼트 찾기 또는 생성
      let audio;
      if (audioElements.has(audioPath)) {
        audio = audioElements.get(audioPath);
      } else {
        audio = new Audio(audioPath);
        audioElements.set(audioPath, audio);
        
        // 로드 오류 처리
        audio.onerror = () => {
          console.error(`오디오 로드 실패: ${audioPath}`);
          resolve();
        };
      }

      currentAudio = audio;
      audio.currentTime = 0;

      // 무한 반복 설정
      if (loops === -1) {
        audio.loop = true;
        audio.play().then(() => {
          resolve();
        }).catch((error) => {
          console.error(`오디오 재생 실패: ${audioPath}`, error);
          resolve();
        });
      } else {
        // 지정된 횟수만큼 반복
        audio.loop = false;
        let playCount = 0;
        
        const playNext = () => {
          if (playCount < loops) {
            audio.currentTime = 0;
            audio.play().then(() => {
              playCount++;
            }).catch((error) => {
              console.error(`오디오 재생 실패: ${audioPath}`, error);
              resolve();
            });
          } else {
            resolve();
          }
        };

        audio.onended = () => {
          if (playCount < loops) {
            playNext();
          } else {
            resolve();
          }
        };

        playNext();
      }
    } catch (error) {
      console.error(`오디오 처리 오류: ${audioPath}`, error);
      resolve();
    }
  });
}

// 배경 전환 함수
async function changeBackground(newBgPath) {
  return new Promise((resolve) => {
    if (!elBackground) {
      resolve();
      return;
    }

    const currentBg = elBackground.style.backgroundImage;
    const newBg = `url(${newBgPath})`;
    
    // 같은 배경이면 전환하지 않음
    if (currentBg === newBg) {
      resolve();
      return;
    }

    // 새 배경 이미지 미리 로드
    const img = new Image();
    img.onload = () => {
      // 새 배경용 임시 div 생성
      const newBgDiv = document.createElement('div');
      newBgDiv.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-image: ${newBg};
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        opacity: 0;
        transition: opacity 1s ease-in-out;
        z-index: 0;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
      `;
      
      // 기존 배경 div에 직접 추가
      elBackground.appendChild(newBgDiv);
      
      // 강제 리플로우 후 페이드 인 시작
      newBgDiv.offsetHeight;
      
      requestAnimationFrame(() => {
        newBgDiv.style.opacity = '1';
        
        setTimeout(() => {
          // 기존 배경을 새 배경으로 교체
          elBackground.style.backgroundImage = newBg;
          
          // 임시 div 제거
          newBgDiv.remove();
          resolve();
        }, 1000);
      });
    };
    
    img.onerror = () => {
      console.error(`배경 이미지 로드 실패: ${newBgPath}`);
      // 오류가 발생해도 게임 진행
      elBackground.style.backgroundImage = newBg;
      resolve();
    };
    
    img.src = newBgPath;
  });
}
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
  
  // 오디오 정지
  stopAudio();
  
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
      if (firstLine.bg) {
        // 첫 번째 씬은 즉시 배경 설정 (전환 효과 없음)
        elBackground.style.backgroundImage = `url(${firstLine.bg})`;
      }
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

    // 오디오 재생 처리
    if (line.audio) {
      const loops = line.loops !== undefined ? line.loops : 1;
      await playAudio(line.audio, loops);
      lineIndex++;
      busy = false;
      await showNext(); // 다음 라인으로 즉시 진행
      return;
    }

    // 오디오 정지 처리 - 음악만 멈추고 즉시 다음으로
    if (line.stopAudio === true) {
      // 현재 재생 중인 오디오 정지
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio.loop = false;
        currentAudio = null;
      }
      lineIndex++;
      busy = false;
      await showNext(); // 즉시 다음 라인으로
      return;
    }

    // 배경 업데이트 (자연스러운 전환)
    if (line.bg) {
      await changeBackground(line.bg);
    }
    
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