/* 비주얼노벨 게임 엔진 - SAVE/LOAD 구현 버전 */

// 상수 정의
const CONFIG = {
  CHAR_LIMIT: 200,
  TYPING_SPEED: 15,
  FADE_DURATION: 1000,
  BACKGROUND_TRANSITION: 1000,
  DEFAULT_AUTO_SPEED: 1500,
  SCENE_TRANSITION_DELAY: 1500,
  MAX_SAVE_SLOTS: 5
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
    this.isFading = false;
    this.isTransitioning = false;
  }

  // 저장용 데이터 생성
  toSaveData() {
    return {
      currentChapter: this.currentChapter,
      currentSceneIndex: this.currentSceneIndex,
      lineIndex: this.lineIndex,
      charCount: this.charCount,
      autoSpeed: this.autoSpeed
    };
  }

  // 저장된 데이터로부터 복원
  fromSaveData(data) {
    this.currentChapter = data.currentChapter;
    this.currentSceneIndex = data.currentSceneIndex;
    this.lineIndex = data.lineIndex;
    this.charCount = data.charCount;
    this.autoSpeed = data.autoSpeed || CONFIG.DEFAULT_AUTO_SPEED;
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
          
          overlay.offsetHeight;
          
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

// 세이브/로드 관리 클래스
class SaveLoadManager {
  constructor() {
    this.savePrefix = 'vnSave_';
  }

  save(slotNumber, gameState, uiState) {
    try {
      const saveData = {
        timestamp: Date.now(),
        gameState: gameState.toSaveData(),
        uiState: {
          backgroundImage: uiState.backgroundImage,
          characterImage: uiState.characterImage,
          characterPosition: uiState.characterPosition,
          textContent: uiState.textContent,
          currentText: uiState.currentText
        }
      };

      localStorage.setItem(
        `${this.savePrefix}${slotNumber}`,
        JSON.stringify(saveData)
      );

      return true;
    } catch (error) {
      console.error('저장 실패:', error);
      return false;
    }
  }

  load(slotNumber) {
    try {
      const data = localStorage.getItem(`${this.savePrefix}${slotNumber}`);
      if (!data) return null;

      return JSON.parse(data);
    } catch (error) {
      console.error('불러오기 실패:', error);
      return null;
    }
  }

  getSaveInfo(slotNumber) {
    const data = this.load(slotNumber);
    if (!data) return null;

    return {
      timestamp: data.timestamp,
      text: data.uiState.currentText || '저장된 데이터',
      exists: true
    };
  }

  deleteSave(slotNumber) {
    try {
      localStorage.removeItem(`${this.savePrefix}${slotNumber}`);
      return true;
    } catch (error) {
      console.error('삭제 실패:', error);
      return false;
    }
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
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
      saveMenu: document.getElementById("save-menu"),
      loadMenu: document.getElementById("load-menu"),
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
      save: document.getElementById("btn-save"),
      load: document.getElementById("btn-load"),
      auto: document.getElementById("btn-auto"),
      skip: document.getElementById("btn-skip"),
      config: document.getElementById("btn-config"),
      hide: document.getElementById("btn-hide"),
      closeSave: document.getElementById("btn-close-save"),
      closeLoad: document.getElementById("btn-close-load")
    };
  }

  initializeManagers() {
    this.gameState = new GameState();
    this.audioManager = new AudioManager();
    this.backgroundManager = new BackgroundManager(this.elements.background);
    this.textTyper = new TextTyper();
    this.shakeEffect = new ShakeEffect(this.elements.gameContent);
    this.saveLoadManager = new SaveLoadManager();
  }

  bindEvents() {
    // 버튼 이벤트
    this.buttons.start.addEventListener("click", this.handleEvent(() => this.startGame()));
    this.buttons.settings.addEventListener("click", this.handleEvent(() => this.showSettings()));
    this.buttons.closeSettings.addEventListener("click", this.handleEvent(() => this.hideSettings()));
    this.buttons.exitToMenu.addEventListener("click", this.handleEvent(() => this.exitToMenu()));

    // 하단 메뉴 버튼 이벤트
    this.buttons.save.addEventListener("click", this.handleEvent(() => this.showSaveMenu()));
    this.buttons.load.addEventListener("click", this.handleEvent(() => this.showLoadMenu()));
    this.buttons.auto.addEventListener("click", this.handleEvent(() => this.toggleAuto()));
    this.buttons.skip.addEventListener("click", this.handleEvent(() => this.toggleSkip()));
    this.buttons.config.addEventListener("click", this.handleEvent(() => this.showSettings()));
    this.buttons.hide.addEventListener("click", this.handleEvent(() => this.toggleHideWindow()));

    // SAVE/LOAD 닫기 버튼
    this.buttons.closeSave.addEventListener("click", this.handleEvent(() => this.hideSaveMenu()));
    this.buttons.closeLoad.addEventListener("click", this.handleEvent(() => this.hideLoadMenu()));

    // 설정 슬라이더 이벤트
    this.elements.autoSpeedSlider.addEventListener("input", (e) => this.updateAutoSpeed(e));

    // 게임 진행 이벤트
    this.elements.game.addEventListener("click", this.handleEvent(() => this.handleGameClick()));
    document.addEventListener("keydown", (e) => this.handleKeydown(e));

    // SAVE/LOAD 슬롯 이벤트 바인딩
    this.bindSaveSlots();
    this.bindLoadSlots();
  }

  bindSaveSlots() {
    const saveSlots = this.elements.saveMenu.querySelectorAll('.save-slot');
    saveSlots.forEach(slot => {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotNumber = parseInt(slot.dataset.slot);
        this.saveGame(slotNumber);
      });
    });
  }

  bindLoadSlots() {
    const loadSlots = this.elements.loadMenu.querySelectorAll('.save-slot');
    loadSlots.forEach(slot => {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotNumber = parseInt(slot.dataset.slot);
        this.loadGame(slotNumber);
      });
    });
  }

  handleEvent(callback) {
    return (e) => {
      e.stopPropagation();
      callback();
    };
  }

  loadSettings() {
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
        !this.elements.settings.classList.contains("hidden") ||
        !this.elements.saveMenu.classList.contains("hidden") ||
        !this.elements.loadMenu.classList.contains("hidden")) return;
    
    if (this.gameState.isFading || this.gameState.isTransitioning) return;
    
    if (this.gameState.isHidden) {
      this.toggleHideWindow();
      return;
    }
    
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
        this.elements.saveMenu.classList.contains("hidden") &&
        this.elements.loadMenu.classList.contains("hidden") &&
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

  showSaveMenu() {
    this.updateSaveSlots();
    this.elements.saveMenu.classList.remove("hidden");
  }

  hideSaveMenu() {
    this.elements.saveMenu.classList.add("hidden");
  }

  showLoadMenu() {
    this.updateLoadSlots();
    this.elements.loadMenu.classList.remove("hidden");
  }

  hideLoadMenu() {
    this.elements.loadMenu.classList.add("hidden");
  }

  updateSaveSlots() {
    const slots = this.elements.saveMenu.querySelectorAll('.save-slot');
    slots.forEach(slot => {
      const slotNumber = parseInt(slot.dataset.slot);
      const saveInfo = this.saveLoadManager.getSaveInfo(slotNumber);
      
      const infoElement = slot.querySelector('.slot-info');
      const dateElement = slot.querySelector('.slot-date');
      
      if (saveInfo) {
        slot.classList.add('has-data');
        infoElement.textContent = saveInfo.text.substring(0, 50) + (saveInfo.text.length > 50 ? '...' : '');
        dateElement.textContent = this.saveLoadManager.formatDate(saveInfo.timestamp);
      } else {
        slot.classList.remove('has-data');
        infoElement.textContent = '빈 슬롯';
        dateElement.textContent = '';
      }
    });
  }

  updateLoadSlots() {
    const slots = this.elements.loadMenu.querySelectorAll('.save-slot');
    slots.forEach(slot => {
      const slotNumber = parseInt(slot.dataset.slot);
      const saveInfo = this.saveLoadManager.getSaveInfo(slotNumber);
      
      const infoElement = slot.querySelector('.slot-info');
      const dateElement = slot.querySelector('.slot-date');
      
      if (saveInfo) {
        slot.classList.add('has-data');
        slot.style.cursor = 'pointer';
        infoElement.textContent = saveInfo.text.substring(0, 50) + (saveInfo.text.length > 50 ? '...' : '');
        dateElement.textContent = this.saveLoadManager.formatDate(saveInfo.timestamp);
      } else {
        slot.classList.remove('has-data');
        slot.style.cursor = 'not-allowed';
        infoElement.textContent = '빈 슬롯';
        dateElement.textContent = '';
      }
    });
  }

  saveGame(slotNumber) {
    // 현재 UI 상태 수집
    const currentLine = this.gameState.scriptData?.lines?.[this.gameState.lineIndex - 1];
    const uiState = {
      backgroundImage: this.elements.background.style.backgroundImage,
      characterImage: this.elements.character.innerHTML,
      characterPosition: this.getCharacterPosition(),
      textContent: this.elements.textArea.innerHTML,
      currentText: currentLine?.text || '게임 진행 중'
    };

    const success = this.saveLoadManager.save(slotNumber, this.gameState, uiState);
    
    if (success) {
      this.updateSaveSlots();
      console.log(`슬롯 ${slotNumber}에 저장 완료`);
    } else {
      console.error('저장 실패');
    }
  }

  async loadGame(slotNumber) {
    const saveData = this.saveLoadManager.load(slotNumber);
    
    if (!saveData) {
      console.log('저장된 데이터가 없습니다');
      return;
    }

    // 메뉴 닫기
    this.hideLoadMenu();

    // 게임 상태 복원
    this.gameState.fromSaveData(saveData.gameState);

    // 씬 인덱스 로드
    await this.loadSceneIndex();

    // 스크립트 로드
    const fileName = this.gameState.sceneIndex?.[this.gameState.currentChapter]?.[this.gameState.currentSceneIndex];
    
    if (!fileName) {
      console.error('저장된 씬을 찾을 수 없습니다');
      return;
    }

    try {
      const response = await fetch(fileName);
      if (!response.ok) throw new Error(`파일 없음: ${fileName}`);
      
      this.gameState.scriptData = await response.json();

      // UI 복원
      this.elements.background.style.backgroundImage = saveData.uiState.backgroundImage;
      this.elements.character.innerHTML = saveData.uiState.characterImage;
      this.setCharacterPositionFromClass(saveData.uiState.characterPosition);
      this.elements.textArea.innerHTML = saveData.uiState.textContent;
      this.gameState.charCount = saveData.gameState.charCount;

      // 페이드 설정
      this.setFadeOpacity("0.5", true);
      
      // AUTO 속도 복원
      this.elements.autoSpeedSlider.value = this.gameState.autoSpeed;
      this.updateAutoSpeedDisplay();

      console.log(`슬롯 ${slotNumber}에서 불러오기 완료`);
    } catch (error) {
      console.error('불러오기 실패:', error);
    }
  }

  getCharacterPosition() {
    if (this.elements.character.classList.contains('pos-left')) return 'left';
    if (this.elements.character.classList.contains('pos-right')) return 'right';
    return 'center';
  }

  setCharacterPositionFromClass(position) {
    this.elements.character.classList.remove('pos-left', 'pos-center', 'pos-right');
    this.elements.character.classList.add(`pos-${position}`);
  }

  exitToMenu() {
    this.hideSettings();
    this.hideSaveMenu();
    this.hideLoadMenu();
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
    
    this.buttons.auto.classList.remove('active');
    this.buttons.skip.classList.remove('active');
    this.buttons.hide.classList.remove('active');
    this.elements.textArea.style.opacity = '1';
    this.elements.bottomMenu.classList.remove('hidden-ui');
    
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
      this.elements.fade.offsetHeight;
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
    if (line.clear === true) {
      this.elements.textArea.innerHTML = "";
      this.gameState.charCount = 0;
      this.gameState.lineIndex++;
      this.gameState.busy = false;
      await this.showNext();
      return;
    }

    if (line.shake && typeof line.shake === 'number' && line.shake >= 1 && line.shake <= 100) {
      await this.shakeEffect.perform(line.shake);
      this.gameState.lineIndex++;
      this.gameState.busy = false;
      await this.showNext();
      return;
    }

    if (line.audio) {
      const loops = line.loops !== undefined ? line.loops : 1;
      await this.audioManager.play(line.audio, loops);
      this.gameState.lineIndex++;
      this.gameState.busy = false;
      await this.showNext();
      return;
    }

    if (line.stopAudio === true) {
      this.audioManager.stop();
      this.gameState.lineIndex++;
      this.gameState.busy = false;
      await this.showNext();
      return;
    }

    if (line.bg) {
      await this.backgroundManager.change(line.bg);
    }
    
    this.updateCharacter(line);

    if (this.gameState.firstLineOfScene) {
      await this.fadeIn();
      this.gameState.firstLineOfScene = false;
    }

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

    if (this.gameState.skipMode) {
      lineElement.textContent = text;
      this.gameState.isTyping = false;
      setTimeout(() => {
        if (this.gameState.skipMode) {
          this.showNext();
        }
      }, 50);
    } else {
      await this.textTyper.type(lineElement, text, this.gameState);
      
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
    
    this.gameState.isTransitioning = true;
    
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

  toggleAuto() {
    this.gameState.autoMode = !this.gameState.autoMode;
    this.gameState.skipMode = false;
    
    this.buttons.auto.classList.toggle('active', this.gameState.autoMode);
    this.buttons.skip.classList.remove('active');
    
    if (this.gameState.autoMode && !this.gameState.isTyping && !this.gameState.busy) {
      setTimeout(() => this.showNext(), this.gameState.autoSpeed);
    }
  }

  toggleSkip() {
    this.gameState.skipMode = !this.gameState.skipMode;
    this.gameState.autoMode = false;
    
    this.buttons.skip.classList.toggle('active', this.gameState.skipMode);
    this.buttons.auto.classList.remove('active');
    
    if (this.gameState.skipMode) {
      this.gameState.skipRequested = true;
    }
  }

  toggleHideWindow() {
    this.gameState.isHidden = !this.gameState.isHidden;
    
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