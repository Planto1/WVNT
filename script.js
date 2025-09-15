/* 전체 진행 로직 (안정성 강화, 재진입 차단, 스킵 처리)
   - scenes.json 을 불러와 자동 스캔 방식으로 진행
   - 씬 파일 예: "01_001.json", "01_002.json" ...
   - 클릭 동작: 
       * 타이핑 중 클릭 -> 현재 줄 즉시 완성(스킵)
       * 타이핑 완료 후 클릭 -> 다음 줄(또는 다음 씬)
*/

///// 상태 변수
let sceneIndex = {};           // scenes.json 내용 (챕터키 -> [파일명,...])
let currentChapter = null;     // e.g. "01"
let currentSceneIndex = 0;     // 인덱스(0부터)
let scriptData = null;         // 현재 씬 JSON content
let lineIndex = 0;             // 현재 씬 내 대사 인덱스
let charCount = 0;             // 현재 화면에 누적된 글자 수 (50 기준)
let firstLineOfScene = true;   // 씬 시작 여부
let isTyping = false;          // 타이핑 중 여부
let skipRequested = false;     // 타이핑 스킵 요청 플래그
let busy = false;              // 재진입 방지 뮤텍스

const TYPING_MS = 40;          // 글자당 ms (조절 가능)
const CHAR_LIMIT = 50;

///// DOM
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

///// 이벤트 바인딩
btnStart.addEventListener("click", startGame);
btnSettings.addEventListener("click", () => elSettings.classList.remove("hidden"));
btnCloseSettings.addEventListener("click", () => elSettings.classList.add("hidden"));
btnExitToMenu.addEventListener("click", () => {
  // 강제 메인복귀
  elSettings.classList.add("hidden");
  elGame.classList.add("hidden");
  elMain.classList.remove("hidden");
});

// 화면 클릭(대사 진행 또는 스킵)
document.addEventListener("click", (e) => {
  // 클릭이 세팅팝업 안의 버튼일 경우 무시 (버튼 핸들러가 따로 있음)
  if (!elGame || elGame.classList.contains("hidden")) return;
  if (!elSettings.classList.contains("hidden")) return; // 세팅 열려있으면 무시

  // 요청 처리
  requestNext();
});

///// helper: 안전한 fade opacity set (instant option)
/* instant=true 면 transition을 잠깐 끄고 바로 설정 -> 화면 깜박임 없이 즉시 변경 가능 */
function setFadeOpacity(value, instant = false) {
  if (!elFade) return;
  if (instant) {
    const prev = elFade.style.transition;
    elFade.style.transition = "none";
    elFade.style.opacity = value;
    // 강제 리플로우로 스타일 즉시 적용
    void elFade.offsetHeight;
    elFade.style.transition = prev || "opacity 1s ease";
  } else {
    elFade.style.opacity = value;
  }
}

///// 씬 인덱스 불러오기
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

///// 씬(JSON) 로드
async function loadScript(chapterKey, sceneIdx) {
  // 재진입 방지: loadScript 는 호출 시 내부에서만 처리 (시작 흐름에서만 호출)
  const fileName = sceneIndex?.[chapterKey]?.[sceneIdx];
  if (!fileName) {
    // 현재 챕터의 씬 목록 끝 => 다음 챕터 시도
    const chapters = Object.keys(sceneIndex).sort();
    const idx = chapters.indexOf(chapterKey);
    const nextChapter = chapters[idx + 1];
    if (nextChapter) {
      currentChapter = nextChapter;
      currentSceneIndex = 0;
      await loadScript(currentChapter, currentSceneIndex);
      return;
    } else {
      // 전체 끝 -> 메인으로 복귀
      elGame.classList.add("hidden");
      elMain.classList.remove("hidden");
      return;
    }
  }

  try {
    const res = await fetch(fileName);
    if (!res.ok) throw new Error("파일 없음: " + fileName);
    scriptData = await res.json();

    // 초기화
    lineIndex = 0;
    charCount = 0;
    firstLineOfScene = true;
    // black 상태(이전 씬에서 fadeOut으로 1로 남아있을 수 있음) -> 유지된 채로 배경교체하여 깜박임 방지
    // 배경/캐릭터를 미리 첫 줄에 있는 값으로 세팅해서 fade-in시 자연스럽게 보이게 함
    const firstLine = (scriptData.lines && scriptData.lines[0]) || null;
    if (firstLine) {
      if (firstLine.bg) elBackground.style.backgroundImage = `url(${firstLine.bg})`;
      if (firstLine.char) elCharacter.innerHTML = `<img src="${firstLine.char}" alt="char">`;
      else elCharacter.innerHTML = "";
    } else {
      elCharacter.innerHTML = "";
    }

    // 씬 교체 직후: 화면은 보통 fade=1(검정) 상태이므로, 새 배경을 깜박임 없이 준비한 다음
    // 즉시 배경이 보이도록 fadeLayer를 0으로 'instant'로 바꿔준다.
    setFadeOpacity("0", true);

    // 텍스트 영역 초기화
    elTextArea.innerHTML = "";

    // 씬 시작: 한 줄 출력
    await showNext();
  } catch (err) {
    console.error("씬 로드 실패:", err);
    // 파일이 문제면 다음 파일을 시도해본다
    currentSceneIndex++;
    await loadScript(currentChapter, currentSceneIndex);
  }
}

///// 게임 시작
async function startGame() {
  // UI 전환
  elMain.classList.add("hidden");
  elGame.classList.remove("hidden");

  // 인덱스 불러오기
  await loadSceneIndex();
  const chapters = Object.keys(sceneIndex).sort();
  if (chapters.length === 0) {
    console.error("scenes.json이 비어있거나 없음");
    elGame.classList.add("hidden");
    elMain.classList.remove("hidden");
    return;
  }
  currentChapter = chapters[0];
  currentSceneIndex = 0;
  await loadScript(currentChapter, currentSceneIndex);
}

///// 다음 동작 요청 (클릭 핸들러로 호출)
function requestNext() {
  // 재진입 가능성 제어는 showNext 내부에서 처리한다.
  showNext();
}

///// showNext: 한 번에 하나만 실행 (busy 체크)
async function showNext() {
  // 재진입 처리: 이미 수행 중일 때
  if (busy) {
    // 만약 타이핑 중이면 스킵 요청만 설정
    if (isTyping) {
      skipRequested = true;
    }
    return;
  }
  busy = true;

  try {
    // 스크립트 유효성 확인
    if (!scriptData || !Array.isArray(scriptData.lines)) {
      // 씬 끝 처리
      await endScene();
      return;
    }

    // 라인 끝나면 씬 종료
    if (lineIndex >= scriptData.lines.length) {
      await endScene();
      return;
    }

    // 현재 라인
    const line = scriptData.lines[lineIndex];

    // 배경/캐릭터 갱신 (라인에 값이 있으면 갱신)
    if (line.bg) elBackground.style.backgroundImage = `url(${line.bg})`;
    if (line.char) elCharacter.innerHTML = `<img src="${line.char}" alt="char">`;
    else if (!line.char) {
      // 만약 라인에 char 정보가 없으면 기존 캐릭터를 그대로 유지 (원한다면 지우기)
      // elCharacter.innerHTML = "";
    }

    // 씬 첫 줄이면 fade-in (밝->어둡: 0 -> 0.5)
    if (firstLineOfScene) {
      await fadeIn();
      firstLineOfScene = false;
    }

    // 텍스트 출력 전 누적 글자 체크
    const txt = (line.text || "").toString();
    if (charCount + txt.length > CHAR_LIMIT) {
      // 초기화 (화면 비우기)
      elTextArea.innerHTML = "";
      charCount = 0;
    }
    charCount += txt.length;

    // 줄 엘리먼트 추가
    const lineEl = document.createElement("div");
    lineEl.className = "line";
    elTextArea.appendChild(lineEl);

    // 타이핑 (클릭 시 스킵)
    await typeText(lineEl, txt);

    // 완료 후 인덱스 증가
    lineIndex++;
  } finally {
    busy = false;
  }
}

///// 타이핑 함수 (skipRequested 사용)
function typeText(element, text) {
  return new Promise((resolve) => {
    isTyping = true;
    skipRequested = false;
    element.textContent = "";

    let i = 0;
    function step() {
      // 스킵 요청이 들어오면 즉시 전체 출력
      if (skipRequested) {
        element.textContent = text;
        element.classList.add("show");
        isTyping = false;
        resolve();
        return;
      }

      if (i < text.length) {
        element.textContent += text.charAt(i++);
        setTimeout(step, TYPING_MS);
      } else {
        element.classList.add("show");
        isTyping = false;
        resolve();
      }
    }

    // 만약 텍스트가 빈 문자열이면 바로 노출
    if (!text) {
      element.classList.add("show");
      isTyping = false;
      resolve();
      return;
    }

    step();
  });
}

///// 씬 종료 처리: fade out -> 다음 씬 로드 or 챕터 전환 or 메인 귀환
async function endScene() {
  // 화면을 완전히 검게 만들어 씬 간 전환 연출
  await fadeOut();

  // 다음 씬 인덱스 증가
  currentSceneIndex++;

  // 다음 씬 로드
  await loadScript(currentChapter, currentSceneIndex);
}

///// fadeIn: 밝 -> 어둡 (0 -> 0.5)
function fadeIn() {
  return new Promise((resolve) => {
    setFadeOpacity("0.5", false);
    // fadeLayer의 transition이 1s 이므로 기다린다
    setTimeout(() => resolve(), 1000);
  });
}

///// fadeOut: 어둡 -> 완전검정 (0.5 또는 0 -> 1)
function fadeOut() {
  return new Promise((resolve) => {
    setFadeOpacity("1", false);
    setTimeout(() => {
      // 씬 끝나면 텍스트 비우기 (loadScript에서 다시 세팅)
      elTextArea.innerHTML = "";
      resolve();
    }, 1000);
  });
}

/* 초기화: fadeLayer 기본값(밝기 0) */
setFadeOpacity("0", true);
