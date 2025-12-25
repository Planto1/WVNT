/* 비주얼노벨 게임 엔진 - 최적화 버전 */

// 상수 정의
const CONFIG = {
  CHAR_LIMIT: 200,
  TYPING_SPEED: 15,
  FADE_DURATION: 1000,
  BACKGROUND_TRANSITION: 1000,
  DEFAULT_AUTO_SPEED: 1500,
  SCENE_TRANSITION_DELAY: 1500 // 씬 전환 시 대기 시간
};

// 게임 상태 관리 클래스
class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.sceneIndex = {};
    this.currentChapter = null;
    this.currentSceneIndex = 0;
    this.scriptData = null;
    this.lineIndex = 0;
    this.charCount = 0;
    this.firstLineOfScene = true;
    this.busy = false;
    this.isTyping = false;
    this.skipRequested = false;
    this.typingTimeoutId = null;
    this.autoMode = false;
    this.skipMode = false;
    this.isHidden = false;
    this.autoSpeed = CONFIG.DEFAULT_AUTO_SPEED;
    this.isFading = false; // 페이드 중 여부
    this.isTransitioning = false; // 씬 전환 중 여부
  }
}

// 오디오 관리 클래스
class AudioManager {
  constructor() {
    this.audioCache = new Map();
    this.currentAudio = null;
  }

  async play(audioPath, loops = 1) {
    try {
      this.stop();

      let audio = this.audioCache.get(audioPath);
      if (!audio) {
        audio = new Audio(audioPath);
        this.audioCache.set(audioPath, audio);
        
        audio.onerror = () => console.error(`오디오 로드 실패: ${audioPath}`);
      }

      this.currentAudio = audio;
      audio.currentTime = 0;

      if (loops === -1) {
        audio.loop = true;
        await audio.play();
      } else {
        audio.loop = false;
        let playCount = 0;
        
        const playNext = async () => {
          if (playCount < loops) {
            audio.currentTime = 0;
            await audio.play();
            playCount++;
          }
        };

        audio.onended = () => {
          if (playCount < loops) playNext();
        };

        await playNext();
      }
    } catch (error) {
      console.error(`오디오 처리 오류: ${audioPath}`, error);
    }
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio.loop = false;
      this.currentAudio = null;
    }
  }

  cleanup() {
    this.stop();
    this.audioCache.clear();
  }
}

// 배경 관리 클래스
class BackgroundManager {
  constructor(backgroundElement) {
    this.element = backgroundElement;
    this.imageCache = new Map();
  }

  async change(newBgPath) {
    if (!this.element) return;

    const currentBg = this.element.style.backgroundImage;
    const newBg = `url(${newBgPath})`;
    
    if (currentBg === newBg) return;

    return new Promise((resolve) => {
      this.preloadImage(newBgPath)
        .then(() => {
          const overlay = this.createOverlay(newBg);
          this.element.appendChild(overlay);
          
          overlay.offsetHeight; // 강제 리플로우
          
          requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            
            setTimeout(() => {
              this.element.style.backgroundImage = newBg;
              overlay.remove();
              resolve();
            }, CONFIG.BACKGROUND_TRANSITION);
          });
        })
        .catch(() => {
          this.element.style.backgroundImage = newBg;
          resolve();
        });
    });
  }

  preloadImage(path) {
    return new Promise((resolve, reject) => {
      if (this.imageCache.has(path)) {
        resolve();
        return;
      }

      const img = new Image();
      img.onload = () => {
        this.imageCache.set(path, true);
        resolve();
      };
      img.onerror = () => {
        console.error(`배경 이미지 로드 실패: ${path}`);
        reject();
      };
      img.src = path;
    });
  }

  createOverlay(backgroundImage) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: ${backgroundImage};
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: 0;
      transition: opacity ${CONFIG.BACKGROUND_TRANSITION}ms ease-in-out;
      z-index: 0;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
    `;
    return overlay;
  }
}

// 텍스트 타이핑 효과 클래스
class TextTyper {
  constructor() {
    this.timeoutId = null;
  }

  async type(element, text, gameState) {
    return new Promise((resolve) => {
      gameState.isTyping = true;
      gameState.skipRequested = false;
      element.textContent = "";
      
      this.clearTimeout();

      if (!text?.trim()) {
        gameState.isTyping = false;
        resolve();
        return;
      }

      let currentIndex = 0;
      
      const typeChar = () => {
        if (gameState.skipRequested) {
          this.clearTimeout();
          element.textContent = text;
          gameState.isTyping = false;
          gameState.skipRequested = false;
          resolve();
          return;
        }

        if (currentIndex >= text.length) {
          this.clearTimeout();
          gameState.isTyping = false;
          resolve();
          return;
        }

        const char = text.charAt(currentIndex);
        element.textContent += char;
        currentIndex++;
        
        const delay = this.getCharDelay(char);
        this.timeoutId = setTimeout(typeChar, delay);
      };
      
      typeChar();
    });
  }

  getCharDelay(char) {
    if (char === '.' || char === '!' || char === '?' || char === '…' || char === '。') {
      return CONFIG.TYPING_SPEED * 3;
    } else if (char === ',' || char === '、') {
      return CONFIG.TYPING_SPEED * 2;
    }
    return CONFIG.TYPING_SPEED;
  }

  clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

// 화면 흔들림 관리 클래스
class ShakeEffect {
  constructor(gameContent) {
    this.element = gameContent;
    this.shakeClasses = ['shake-1-25', 'shake-26-50', 'shake-51-75', 'shake-76-100'];
  }

  async perform(intensity) {
    if (!this.element || intensity < 1 || intensity > 100) return;

    return new Promise((resolve) => {
      this.element.classList.remove(...this.shakeClasses);
      
      const shakeClass = this.getShakeClass(intensity);
      this.element.classList.add(shakeClass);
      
      const duration = this.getDuration(shakeClass);
      
      setTimeout(() => {
        this.element.classList.remove(shakeClass);
        resolve();
      }, duration);
    });
  }

  getShakeClass(intensity) {
    if (intensity <= 25) return 'shake-1-25';
    if (intensity <= 50) return 'shake-26-50';
    if (intensity <= 75) return 'shake-51-75';
    return 'shake-76-100';
  }

  getDuration(shakeClass) {
    const durations = {
      'shake-1-25': 400,
      'shake-26-50': 600,
      'shake-51-75': 800,
      'shake-76-100': 1000
    };
    return durations[shakeClass] || 400;
  }
}

// 메인 게임 엔진 클래스
class VisualNovelEngine {
  constructor() {
    this.initializeElements();
    this.initializeManagers();
    this.bindEvents();
    this.setInitialFade();
    this.loadSettings();
  }

  initializeElements() {
    this.elements = {
      main: document.getElementById("main-menu"),
      game: document.getElementById("game-screen"),
      background: document.getElementById("background"),
      character: document.getElementById("character"),
      fade: document.getElementById("fadeLayer"),
      textArea: document.getElementById("text-area"),
      settings: document.getElementById("settings"),
      gameContent: document.querySelector('.game-content'),
      bottomMenu: document.getElementById("bottom-menu"),
      autoSpeedSlider: document.getElementById("auto-speed"),
      autoSpeedValue: document.getElementById("auto-speed-value")
    };

    this.buttons = {
      start: document.getElementById("btn-start"),
      settings: document.getElementById("btn-settings"),
      closeSettings: document.getElementById("btn-close-settings"),
      exitToMenu: document.getElementById("btn-exit-to-menu"),
      // 하단 메뉴 버튼들
      save: document.getElementById("btn-save"),
      load: document.getElementById("btn-load"),
      auto: document.getElementById("btn-auto"),
      skip: document.getElementById("btn-skip"),
      config: document.getElementById("btn-config"),
      hide: document.getElementById("btn-hide")
    };
  }

  initializeManagers() {
    this.gameState = new GameState();
    this.audioManager = new AudioManager();
    this.backgroundManager = new BackgroundManager(this.elements.background);
    this.textTyper = new TextTyper();
    this.shakeEffect = new ShakeEffect(this.elements.gameContent);
  }

  bindEvents() {
    // 버튼 이벤트
    this.buttons.start.addEventListener("click", this.handleEvent(() => this.startGame()));
    this.buttons.settings.addEventListener("click", this.handleEvent(() => this.showSettings()));
    this.buttons.closeSettings.addEventListener("click", this.handleEvent(() => this.hideSettings()));
    this.buttons.exitToMenu.addEventListener("click", this.handleEvent(() => this.exitToMenu()));

    // 하단 메뉴 버튼 이벤트
    this.buttons.save.addEventListener("click", this.handleEvent(() => this.handleSave()));
    this.buttons.load.addEventListener("click", this.handleEvent(() => this.handleLoad()));
    this.buttons.auto.addEventListener("click", this.handleEvent(() => this.toggleAuto()));
    this.buttons.skip.addEventListener("click", this.handleEvent(() => this.toggleSkip()));
    this.buttons.config.addEventListener("click", this.handleEvent(() => this.showSettings()));
    this.buttons.hide.addEventListener("click", this.handleEvent(() => this.toggleHideWindow()));

    // 설정 슬라이더 이벤트
    this.elements.autoSpeedSlider.addEventListener("input", (e) => this.updateAutoSpeed(e));

    // 게임 진행 이벤트
    this.elements.game.addEventListener("click", this.handleEvent(() => this.handleGameClick()));
    document.addEventListener("keydown", (e) => this.handleKeydown(e));
  }

  handleEvent(callback) {
    return (e) => {
      e.stopPropagation();
      callback();
    };
  }

  loadSettings() {
    // localStorage에서 설정 불러오기 (옵션)
    const savedSpeed = localStorage.getItem('autoSpeed');
    if (savedSpeed) {
      this.gameState.autoSpeed = parseInt(savedSpeed);
      this.elements.autoSpeedSlider.value = this.gameState.autoSpeed;
      this.updateAutoSpeedDisplay();
    }
  }

  updateAutoSpeed(e) {
    this.gameState.autoSpeed = parseInt(e.target.value);
    this.updateAutoSpeedDisplay();
    localStorage.setItem('autoSpeed', this.gameState.autoSpeed);
  }

  updateAutoSpeedDisplay() {
    const seconds = (this.gameState.autoSpeed / 1000).toFixed(1);
    this.elements.autoSpeedValue.textContent = `${seconds}초`;
  }

  handleGameClick() {
    if (this.elements.game.classList.contains("hidden") || 
        !this.elements.settings.classList.contains("hidden")) return;
    
    // 페이드 중이거나 씬 전환 중일 때는 클릭 무시 (버그 1 수정)
    if (this.gameState.isFading || this.gameState.isTransitioning) return;
    
    // 창 숨김 상태에서는 클릭하면 다시 보이기
    if (this.gameState.isHidden) {
      this.toggleHideWindow();
      return;
    }
    
    // Auto나 Skip 모드 해제
    if (this.gameState.autoMode || this.gameState.skipMode) {
      this.gameState.autoMode = false;
      this.gameState.skipMode = false;
      this.buttons.auto.classList.remove('active');
      this.buttons.skip.classList.remove('active');
    }
    
    if (this.gameState.isTyping) {
      this.gameState.skipRequested = true;
    } else {
      this.showNext();
    }
  }

  handleKeydown(e) {
    if (!this.elements.game.classList.contains("hidden") && 
        this.elements.settings.classList.contains("hidden") && 
        e.key === "Enter") {
      e.preventDefault();
      this.handleGameClick();
    }
  }

  showSettings() {
    this.elements.settings.classList.remove("hidden");
  }

  hideSettings() {
    this.elements.settings.classList.add("hidden");
  }

  exitToMenu() {
    this.hideSettings();
    this.elements.game.classList.add("hidden");
    this.elements.main.classList.remove("hidden");
    this.resetGame();
  }

  resetGame() {
    this.gameState.reset();
    this.textTyper.clearTimeout();
    this.audioManager.stop();
    this.elements.textArea.innerHTML = "";
    this.elements.character.innerHTML = "";
    this.elements.character.classList.remove('pos-left', 'pos-center', 'pos-right');
    
    // 하단 메뉴 버튼 상태 초기화
    this.buttons.auto.classList.remove('active');
    this.buttons.skip.classList.remove('active');
    this.buttons.hide.classList.remove('active');
    this.elements.textArea.style.opacity = '1';
    this.elements.bottomMenu.classList.remove('hidden-ui');
    
    // 설정 복원
    this.loadSettings();
  }

  setInitialFade() {
    this.setFadeOpacity("1", true);
  }

  setFadeOpacity(value, instant = false) {
    if (!this.elements.fade) return;
    
    if (instant) {
      const transition = this.elements.fade.style.transition;
      this.elements.fade.style.transition = "none";
      this.elements.fade.style.opacity = value;
      this.elements.fade.offsetHeight; // 강제 리플로우
      this.elements.fade.style.transition = transition || "opacity 1s ease";
    } else {
      this.elements.fade.style.opacity = value;
    }
  }

  async loadSceneIndex() {
    try {
      const response = await fetch("scenes.json");
      if (!response.ok) throw new Error("scenes.json not found");
      this.gameState.sceneIndex = await response.json();
    } catch (error) {
      console.error("scenes.json 로드 실패:", error);
      // 폴백 데이터
      this.gameState.sceneIndex = {
        "01": ["01_001.json", "01_002.json"],
        "02": ["02_001.json"]
      };
    }
  }

  async startGame() {
    this.elements.main.classList.add("hidden");
    this.elements.game.classList.remove("hidden");
    this.setInitialFade();
    
    await this.loadSceneIndex();
    const chapters = Object.keys(this.gameState.sceneIndex).sort();
    
    if (chapters.length === 0) {
      console.error("씬 데이터가 없습니다");
      this.exitToMenu();
      return;
    }
    
    this.gameState.currentChapter = chapters[0];
    this.gameState.currentSceneIndex = 0;
    await this.loadScript(this.gameState.currentChapter, this.gameState.currentSceneIndex);
  }

  async loadScript(chapterKey, sceneIdx) {
    const fileName = this.gameState.sceneIndex?.[chapterKey]?.[sceneIdx];
    
    if (!fileName) {
      await this.handleSceneEnd(chapterKey);
      return;
    }

    try {
      const response = await fetch(fileName);
      if (!response.ok) throw new Error(`파일 없음: ${fileName}`);
      
      this.gameState.scriptData = await response.json();
      this.initializeScene();
      await this.showNext();
    } catch (error) {
      console.error("씬 로드 실패:", error);
      this.gameState.currentSceneIndex++;
      await this.loadScript(chapterKey, this.gameState.currentSceneIndex);
    }
  }

  async handleSceneEnd(chapterKey) {
    const chapters = Object.keys(this.gameState.sceneIndex).sort();
    const idx = chapters.indexOf(chapterKey);
    const nextChapter = chapters[idx + 1];
    
    if (nextChapter && nextChapter !== chapterKey) {
      this.gameState.currentChapter = nextChapter;
      this.gameState.currentSceneIndex = 0;
      await this.loadScript(this.gameState.currentChapter, this.gameState.currentSceneIndex);
    } else {
      this.exitToMenu();
    }
  }

  initializeScene() {
    this.gameState.lineIndex = 0;
    this.gameState.charCount = 0;
    this.gameState.firstLineOfScene = true;
    
    const firstLine = this.gameState.scriptData.lines?.[0];
    if (firstLine) {
      this.setupInitialScene(firstLine);
    } else {
      this.elements.character.innerHTML = "";
    }

    this.setFadeOpacity("1", true);
    this.elements.textArea.innerHTML = "";
  }

  setupInitialScene(firstLine) {
    if (firstLine.bg) {
      this.elements.background.style.backgroundImage = `url(${firstLine.bg})`;
    }
    
    if (firstLine.char) {
      this.elements.character.innerHTML = `<img src="${firstLine.char}" alt="char">`;
      this.setCharacterPosition(firstLine.pos || 'center');
    } else if (firstLine.char === "") {
      this.elements.character.innerHTML = "";
    }
  }

  setCharacterPosition(position) {
    this.elements.character.classList.remove('pos-left', 'pos-center', 'pos-right');
    this.elements.character.classList.add(`pos-${position}`);
  }

  async showNext() {
    if (this.gameState.busy) return;
    
    // HIDE.W 상태에서는 시나리오 진행 차단 (버그 3 수정)
    if (this.gameState.isHidden) return;
    
    this.gameState.busy = true;

    try {
      if (!this.gameState.scriptData?.lines || 
          this.gameState.lineIndex >= this.gameState.scriptData.lines.length) {
        await this.endScene();
        return;
      }

      const line = this.gameState.scriptData.lines[this.gameState.lineIndex];
      await this.processLine(line);
      
    } finally {
      this.gameState.busy = false;
    }
  }

  async processLine(line) {
    // 화면 클리어 (버그 2 수정: clear 후 자동 진행)
    if (line.clear === true) {
      this.elements.textArea.innerHTML = "";
      this.gameState.charCount = 0;
      this.gameState.lineIndex++;
      this.gameState.busy = false; // busy 해제하고
      await this.showNext(); // 다음 라인 처리
      return;
    }

    // 화면 흔들림
    if (line.shake && typeof line.shake === 'number' && line.shake >= 1 && line.shake <= 100) {
      await this.shakeEffect.perform(line.shake);
      this.gameState.lineIndex++;
      this.gameState.busy = false; // busy 해제하고
      await this.showNext(); // 다음 라인 처리
      return;
    }

    // 오디오 재생
    if (line.audio) {
      const loops = line.loops !== undefined ? line.loops : 1;
      await this.audioManager.play(line.audio, loops);
      this.gameState.lineIndex++;
      this.gameState.busy = false; // busy 해제하고
      await this.showNext(); // 다음 라인 처리
      return;
    }

    // 오디오 정지
    if (line.stopAudio === true) {
      this.audioManager.stop();
      this.gameState.lineIndex++;
      this.gameState.busy = false; // busy 해제하고
      await this.showNext(); // 다음 라인 처리
      return;
    }

    // 배경 변경
    if (line.bg) {
      await this.backgroundManager.change(line.bg);
    }
    
    // 캐릭터 업데이트
    this.updateCharacter(line);

    // 첫 라인 페이드 인
    if (this.gameState.firstLineOfScene) {
      await this.fadeIn();
      this.gameState.firstLineOfScene = false;
    }

    // 텍스트 출력
    await this.displayText(line);
    this.gameState.lineIndex++;
  }

  updateCharacter(line) {
    if (line.char) {
      this.elements.character.innerHTML = `<img src="${line.char}" alt="char">`;
    } else if (line.char === "") {
      this.elements.character.innerHTML = "";
    }
    
    if (line.pos) {
      this.setCharacterPosition(line.pos);
    } else if (!this.elements.character.classList.contains('pos-left') && 
               !this.elements.character.classList.contains('pos-right') && 
               !this.elements.character.classList.contains('pos-center')) {
      this.setCharacterPosition('center');
    }
  }

  async displayText(line) {
    const text = (line.text || "").toString();
    
    if (this.gameState.charCount + text.length > CONFIG.CHAR_LIMIT) {
      this.elements.textArea.innerHTML = "";
      this.gameState.charCount = 0;
    }
    
    this.gameState.charCount += text.length;

    const lineElement = document.createElement("div");
    lineElement.className = "line";
    this.elements.textArea.appendChild(lineElement);

    // Skip 모드일 때는 즉시 표시
    if (this.gameState.skipMode) {
      lineElement.textContent = text;
      this.gameState.isTyping = false;
      // Skip 모드에서는 바로 다음으로
      setTimeout(() => {
        if (this.gameState.skipMode) {
          this.showNext();
        }
      }, 50);
    } else {
      await this.textTyper.type(lineElement, text, this.gameState);
      
      // Auto 모드일 때 자동으로 다음 라인
      if (this.gameState.autoMode && !this.gameState.isTyping) {
        setTimeout(() => {
          if (this.gameState.autoMode) {
            this.showNext();
          }
        }, this.gameState.autoSpeed);
      }
    }
  }

  async endScene() {
    await this.fadeOut();
    
    // 씬 전환 중 플래그 설정 (버그 1 수정)
    this.gameState.isTransitioning = true;
    
    // 검은 화면에서 일정 시간 대기 후 다음 씬으로 자동 전환
    setTimeout(() => {
      this.gameState.isTransitioning = false;
      this.gameState.currentSceneIndex++;
      this.loadScript(this.gameState.currentChapter, this.gameState.currentSceneIndex);
    }, CONFIG.SCENE_TRANSITION_DELAY);
  }

  fadeIn() {
    return new Promise((resolve) => {
      this.gameState.isFading = true;
      this.setFadeOpacity("0.5", false);
      setTimeout(() => {
        this.gameState.isFading = false;
        resolve();
      }, CONFIG.FADE_DURATION);
    });
  }

  fadeOut() {
    return new Promise((resolve) => {
      this.gameState.isFading = true;
      this.setFadeOpacity("1", false);
      setTimeout(() => {
        this.elements.textArea.innerHTML = "";
        this.gameState.isFading = false;
        resolve();
      }, CONFIG.FADE_DURATION);
    });
  }

  // 하단 메뉴 기능들
  handleSave() {
    console.log("Save 기능 - 구현 예정");
    // TODO: 저장 기능 구현
  }

  handleLoad() {
    console.log("Load 기능 - 구현 예정");
    // TODO: 불러오기 기능 구현
  }

  toggleAuto() {
    this.gameState.autoMode = !this.gameState.autoMode;
    this.gameState.skipMode = false; // auto와 skip은 동시에 활성화 불가
    
    this.buttons.auto.classList.toggle('active', this.gameState.autoMode);
    this.buttons.skip.classList.remove('active');
    
    if (this.gameState.autoMode && !this.gameState.isTyping && !this.gameState.busy) {
      // 자동 진행 시작
      setTimeout(() => this.showNext(), this.gameState.autoSpeed);
    }
  }

  toggleSkip() {
    this.gameState.skipMode = !this.gameState.skipMode;
    this.gameState.autoMode = false; // auto와 skip은 동시에 활성화 불가
    
    this.buttons.skip.classList.toggle('active', this.gameState.skipMode);
    this.buttons.auto.classList.remove('active');
    
    if (this.gameState.skipMode) {
      this.gameState.skipRequested = true;
    }
  }

  toggleHideWindow() {
    this.gameState.isHidden = !this.gameState.isHidden;
    
    // HIDE.W 활성화 시 AUTO/SKIP 모드 해제
    if (this.gameState.isHidden) {
      this.gameState.autoMode = false;
      this.gameState.skipMode = false;
      this.buttons.auto.classList.remove('active');
      this.buttons.skip.classList.remove('active');
    }
    
    this.elements.textArea.style.opacity = this.gameState.isHidden ? '0' : '1';
    this.elements.bottomMenu.classList.toggle('hidden-ui', this.gameState.isHidden);
    this.buttons.hide.classList.toggle('active', this.gameState.isHidden);
  }
}

// 게임 초기화
const game = new VisualNovelEngine();