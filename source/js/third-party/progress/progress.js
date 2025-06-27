class ReadingProgressManager {
  constructor(options = {}) {
    // 默认配置
    this.config = {
      storageKey: 'readingProgressData', // localStorage存储键名
      throttleDelay: 300,               // 滚动事件节流延迟(毫秒)
      saveDebounceDelay: 1000,          // 保存操作防抖延迟(毫秒)
      maxEntries: 100,                  // 最大保存条目数
      purgeThreshold: 30 * 24 * 60 * 60 * 1000, // 自动清理过期数据的时间阈值(30天)
      ...options
    };
    this.throttleTimer = null;
    this.debounceTimer = null;
    this.lastScrollTop = 0;
    this.isInitialized = false;
    this.originalHash = null;
  }

  // 初始化阅读进度管理器
  init() {
    if (this.isInitialized) return;

    // 先覆盖掉 hash，我们仅认为在历史记录后的 hash 是有意义的
    // if (window.location.hash === "#more") {
    this.originalHash = window.location.hash;
    history.replaceState(null, null, window.location.pathname + window.location.search);
    // }

    // if (!window.location.hash || window.location.hash == "#more") {
    //   // 页面加载完成后恢复进度
    window.addEventListener('load', () => {
      this.restoreProgress();
    });
    // }

    // 监听滚动事件，使用节流优化性能
    window.addEventListener('scroll', () => {
      if (this.throttleTimer) clearTimeout(this.throttleTimer);
      this.throttleTimer = setTimeout(() => {
        this.updateProgress();
      }, this.config.throttleDelay);
    });

    // 监听页面卸载事件，确保进度保存
    window.addEventListener('beforeunload', () => this.saveProgress());

    // 监听页面可见性变化，在页面隐藏时保存进度
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveProgress();
    });

    // 定期清理旧数据
    this.schedulePurge();

    this.isInitialized = true;
  }

  // 更新当前阅读进度
  updateProgress() {
    this.lastScrollTop = window.scrollY;
    console.log(new Date().getTime(), "updated", this.lastScrollTop);
    // 使用防抖技术减少保存频率
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.saveProgress();
    }, this.config.saveDebounceDelay);
  }

  // 保存进度到localStorage
  saveProgress() {
    const url = this.getNormalizedUrl();
    const scrollTop = this.lastScrollTop;
    const timestamp = Date.now();
    try {
      // 获取现有进度数据
      const progressData = this.getProgressData();
      console.log(new Date().getTime(), "saved", scrollTop);
      // 更新或添加当前页面进度
      progressData[url] = {
        scrollTop,
        timestamp
      };

      // 限制存储条目数量，防止localStorage溢出
      if (Object.keys(progressData).length > this.config.maxEntries) {
        this.purgeOldEntries(progressData);
      }

      // 保存回localStorage
      localStorage.setItem(this.config.storageKey, JSON.stringify(progressData));
    } catch (error) {
      console.error('保存阅读进度失败:', error);
    }
  }

  // 从localStorage恢复进度
  restoreProgress() {
    try {
      const url = this.getNormalizedUrl();
      const progressData = this.getProgressData();

      // 检查是否有当前页面的保存进度
      if (progressData[url]) {
        const { scrollTop } = progressData[url];
        console.log(new Date().getTime(), "restored", scrollTop);
        if (this.originalHash) {
          console.log(new Date().getTime(), "check hash", this.originalHash);
          let targetElement = document.querySelector("#" + decodeURI(this.originalHash.slice(1)))
          // 如果找到对应的元素，使用其位置
          if (targetElement) {
            const rect = targetElement.getBoundingClientRect();
            let targetScrollTop = window.scrollY + rect.top;
            if (targetScrollTop >= scrollTop) { // hash在后才跳转
              console.log("history behind hash");
              requestAnimationFrame(() => {
                window.scrollTo(0, targetScrollTop);
              });
              history.replaceState(null, null, window.location.pathname + window.location.search + "#" + decodeURI(this.originalHash.slice(1)));
            } else {
              console.log("hash behind history");
              requestAnimationFrame(() => {
                window.scrollTo(0, scrollTop);
              });
            }
          } else {
            console.log("wrong hash");
            requestAnimationFrame(() => {
              window.scrollTo(0, scrollTop);
            });
          }
        } else {
          // 使用requestAnimationFrame确保页面完全加载后再滚动
          console.log("no hash, failing to history");
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollTop);
          });
        }
      }
      else if (this.originalHash) {
        console.log("hash only");
        console.log(new Date().getTime(), "check hash", this.originalHash);
        let targetElement = document.querySelector("#" + decodeURI(this.originalHash.slice(1)))
        // 如果找到对应的元素，使用其位置
        if (targetElement) {
          const rect = targetElement.getBoundingClientRect();
          let targetScrollTop = window.scrollY + rect.top;
          requestAnimationFrame(() => {
            window.scrollTo(0, targetScrollTop);
          });
          history.replaceState(null, null, window.location.pathname + window.location.search + this.originalHash);

        } else {
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollTop);
          });
        }
      }
    } catch (error) {
      console.error('恢复阅读进度失败:', error);
    }
  }

  // 清除当前页面的阅读进度
  clearProgress() {
    try {
      const url = this.getNormalizedUrl();
      const progressData = this.getProgressData();

      if (progressData[url]) {
        delete progressData[url];
        localStorage.setItem(this.config.storageKey, JSON.stringify(progressData));
      }
    } catch (error) {
      console.error('清除阅读进度失败:', error);
    }
  }

  // 清除所有保存的阅读进度
  clearAllProgress() {
    try {
      localStorage.removeItem(this.config.storageKey);
    } catch (error) {
      console.error('清除所有阅读进度失败:', error);
    }
  }

  // 获取当前标准化的URL（不包含查询参数和哈希）
  getNormalizedUrl() {
    const url = new URL(window.location.href);
    return `${url.origin}${url.pathname}`;
  }

  // 获取存储的所有进度数据
  getProgressData() {
    try {
      const data = localStorage.getItem(this.config.storageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('读取阅读进度数据失败:', error);
      return {};
    }
  }

  // 清理旧的进度条目
  purgeOldEntries(progressData) {
    // 按时间戳排序，删除最旧的条目
    const entries = Object.entries(progressData);
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // 计算需要删除的数量
    const entriesToDelete = entries.length - this.config.maxEntries;
    if (entriesToDelete > 0) {
      for (let i = 0; i < entriesToDelete; i++) {
        delete progressData[entries[i][0]];
      }
    }
  }

  // 安排定期清理任务
  schedulePurge() {
    setInterval(() => {
      try {
        const progressData = this.getProgressData();
        const now = Date.now();

        // 删除超过阈值的条目
        for (const url in progressData) {
          if (now - progressData[url].timestamp > this.config.purgeThreshold) {
            delete progressData[url];
          }
        }

        localStorage.setItem(this.config.storageKey, JSON.stringify(progressData));
      } catch (error) {
        console.error('定期清理阅读进度失败:', error);
      }
    }, 24 * 60 * 60 * 1000); // 每天执行一次
  }
}

// 使用示例
document.addEventListener('DOMContentLoaded', () => {
  history.scrollRestoration = "manual"; // prevent default effect;
  // 初始化阅读进度管理器
  const progressManager = new ReadingProgressManager({
    storageKey: 'ReadingProgress', // 自定义存储键名
    throttleDelay: 200,             // 调整节流延迟
    maxEntries: 100                  // 限制最多保存100个页面的进度
  });

  // 启动进度管理
  progressManager.init();

  // 可选：提供手动清除当前页面进度的方法
  window.clearCurrentProgress = () => {
    progressManager.clearProgress();
    console.log('当前页面阅读进度已清除');
  };
});