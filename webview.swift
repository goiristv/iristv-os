import Cocoa
import WebKit
import GameController
import Metal

final class IrisAppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var webView: WKWebView!
  var appContainer: NSView!
  var appHeaderBar: NSView!
  var appWebViewSlot: NSView!
  var appWebView: WKWebView?
  var appTitleLabel: NSTextField!
  var currentAppUrl: URL?
  let targetURL: URL
  private var backendProcess: Process?
  private var activeMetalDevice: MTLDevice?
  private var activeCommandQueue: MTLCommandQueue?

  // Apple TV Fast App Switching, State Restoration & Low RAM Suspend
  private var warmAppViews: [String: WKWebView] = [:]
  private var warmAppLru: [String] = []
  private var currentAppKey: String? = nil
  private var snapshotImageView: NSImageView!
  private let maxWarmApps = 3
  private var cachedTvNavScript: String?
  private var cachedPwScript: String?

  func applyGpuPreference(_ pref: String) {
    let devices = MTLCopyAllDevices()
    NSLog("[irisTV GPU] Configurando GPU: \(pref). GPUs: \(devices.map { $0.name }.joined(separator: ", "))")
    if pref == "integrated" {
      if let low = devices.first(where: { $0.isLowPower }) {
        self.activeMetalDevice = low
        self.activeCommandQueue = low.makeCommandQueue()
        NSLog("[irisTV GPU] Modo GPU Integrada ativado: \(low.name)")
        return
      }
    }
    if let high = devices.first(where: { !$0.isLowPower }) {
      self.activeMetalDevice = high
      self.activeCommandQueue = high.makeCommandQueue()
      NSLog("[irisTV GPU] Modo GPU Dedicada de Alto Desempenho ativado: \(high.name)")
    } else if let fallback = MTLCreateSystemDefaultDevice() {
      self.activeMetalDevice = fallback
      self.activeCommandQueue = fallback.makeCommandQueue()
      NSLog("[irisTV GPU] GPU Padrão do Sistema: \(fallback.name)")
    }
  }

  init(url: URL) {
    self.targetURL = url
    super.init()
  }

  private func ensureServerRunning() {
    let testUrl = URL(string: "http://127.0.0.1:3000/lightning/index.html")!
    let sem = DispatchSemaphore(value: 0)
    var isUp = false

    var req = URLRequest(url: testUrl)
    req.timeoutInterval = 0.5
    URLSession.shared.dataTask(with: req) { _, res, _ in
      if let http = res as? HTTPURLResponse, http.statusCode == 200 {
        isUp = true
      }
      sem.signal()
    }.resume()

    _ = sem.wait(timeout: .now() + 0.6)
    if isUp {
      NSLog("[irisTV macOS] Servidor local ativo em http://127.0.0.1:3000")
      return
    }

    NSLog("[irisTV macOS] Iniciando servidor Node.js em background...")
    let nodePaths = [
      "/usr/local/bin/node",
      "/opt/homebrew/bin/node",
      "/usr/bin/node"
    ]
    var nodeBin: String? = nil
    for p in nodePaths {
      if FileManager.default.fileExists(atPath: p) {
        nodeBin = p
        break
      }
    }

    if nodeBin == nil {
      let which = Process()
      which.launchPath = "/usr/bin/which"
      which.arguments = ["node"]
      let pipe = Pipe()
      which.standardOutput = pipe
      try? which.run()
      which.waitUntilExit()
      let data = pipe.fileHandleForReading.readDataToEndOfFile()
      if let str = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !str.isEmpty {
        nodeBin = str
      }
    }

    guard let nodeExecutable = nodeBin else {
      NSLog("[irisTV macOS] Node.js não localizado no sistema!")
      return
    }

    let candidates = [
      Bundle.main.bundlePath + "/../../server.js",
      FileManager.default.currentDirectoryPath + "/server.js",
      "/Users/macosx/Downloads/irisoS/server.js"
    ]
    var serverScript: String? = nil
    for c in candidates {
      if FileManager.default.fileExists(atPath: c) {
        serverScript = (c as NSString).standardizingPath
        break
      }
    }

    guard let scriptPath = serverScript else {
      NSLog("[irisTV macOS] server.js não localizado!")
      return
    }

    let proc = Process()
    proc.launchPath = nodeExecutable
    proc.arguments = [scriptPath]
    proc.currentDirectoryPath = (scriptPath as NSString).deletingLastPathComponent
    try? proc.run()
    self.backendProcess = proc
    Thread.sleep(forTimeInterval: 0.8)
  }

  func applicationWillTerminate(_ notification: Notification) {
    for (key, view) in warmAppViews {
      if let url = view.url?.absoluteString {
        saveAppSession(key: key, url: url)
      }
    }
    if let proc = backendProcess, proc.isRunning {
      NSLog("[irisTV macOS] Encerrando servidor Node.js local...")
      proc.terminate()
    }
  }

  // MARK: - Apple TV Session & Snapshot Storage
  private var irisDataDirectory: URL {
    let home = FileManager.default.homeDirectoryForCurrentUser
    let dir = home.appendingPathComponent(".iristv", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private var snapshotsDirectory: URL {
    let dir = irisDataDirectory.appendingPathComponent("snapshots", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private func saveSnapshot(key: String, image: NSImage) {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.72]) else { return }
    let file = snapshotsDirectory.appendingPathComponent("\(key.lowercased()).jpg")
    try? jpeg.write(to: file)
  }

  private func loadSnapshot(key: String) -> NSImage? {
    let file = snapshotsDirectory.appendingPathComponent("\(key.lowercased()).jpg")
    guard FileManager.default.fileExists(atPath: file.path) else { return nil }
    return NSImage(contentsOf: file)
  }

  private func sessionKey(for appKey: String) -> String {
    return "iris_session_\(appKey.lowercased())"
  }

  private func saveAppSession(key: String, url: String, scrollX: Double = 0, scrollY: Double = 0) {
    let cleanKey = key.lowercased()
    let dict: [String: Any] = [
      "key": cleanKey,
      "url": url,
      "scrollX": scrollX,
      "scrollY": scrollY,
      "savedAt": Date().timeIntervalSince1970
    ]
    UserDefaults.standard.set(dict, forKey: sessionKey(for: cleanKey))
    UserDefaults.standard.synchronize()
  }

  private func loadAppSession(key: String) -> [String: Any]? {
    let cleanKey = key.lowercased()
    return UserDefaults.standard.dictionary(forKey: sessionKey(for: cleanKey))
  }

  private func loadTvSpatialNavScript() -> String? {
    let candidates = [
      Bundle.main.bundlePath + "/../../os/tv-nav-extension/tv-SpatialNav.js",
      FileManager.default.currentDirectoryPath + "/os/tv-nav-extension/tv-SpatialNav.js",
      "/Users/macosx/Downloads/irisoS/os/tv-nav-extension/tv-SpatialNav.js"
    ]
    for path in candidates {
      if let content = try? String(contentsOfFile: path, encoding: .utf8), !content.isEmpty {
        return content
      }
    }
    return nil
  }

  private func passwordManagerScriptSource() -> String {
    return """
    (function() {
      if (window.__irisPwMgrInit) return;
      window.__irisPwMgrInit = true;
      var lastSentHost = '';
      var filledOnce = false;

      function setNativeValue(el, val) {
        if (!el || val == null) return;
        try {
          var desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          if (desc && desc.set) desc.set.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
      }

      function findCredentialFields() {
        var pw = document.querySelector('input[type="password"]');
        if (!pw) return null;
        var form = pw.form || pw.closest('form') || document;
        var userInputs = Array.from(form.querySelectorAll('input[type="email"], input[type="text"], input[type="tel"], input:not([type])'));
        var user = userInputs.find(function(inp) {
          if (inp === pw || inp.disabled || inp.readOnly) return false;
          var r = inp.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }) || null;
        return { user: user, pw: pw };
      }

      function showSavedBanner(host) {
        try {
          var id = '__iris_pw_toast';
          var prev = document.getElementById(id);
          if (prev) prev.remove();
          var box = document.createElement('div');
          box.id = id;
          box.textContent = 'Senha salva para ' + host + ' no irisTV';
          box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;padding:10px 16px;border-radius:999px;background:rgba(15,23,42,0.92);color:#fff;font:600 13px -apple-system,sans-serif;border:1px solid rgba(255,255,255,0.22);box-shadow:0 10px 28px rgba(0,0,0,0.45);backdrop-filter:blur(14px);';
          document.body.appendChild(box);
          setTimeout(function() { try { box.remove(); } catch(_) {} }, 3200);
        } catch (_) {}
      }

      window.__irisFillCredentials = function(username, password) {
        var fields = findCredentialFields();
        if (!fields) return;
        if (fields.user && username && !fields.user.value) setNativeValue(fields.user, username);
        if (fields.pw && password && !fields.pw.value) setNativeValue(fields.pw, password);
        filledOnce = true;
      };

      function requestFillIfReady() {
        if (filledOnce) return;
        var fields = findCredentialFields();
        if (!fields) return;
        var host = location.hostname || '';
        if (!host || host === 'localhost' || host === '127.0.0.1') return;
        if (lastSentHost === host) return;
        lastSentHost = host;
        try {
          window.webkit.messageHandlers.irisWebView.postMessage({ action: 'getCredentials', host: host });
        } catch (_) {}
      }

      function captureAndSave() {
        var fields = findCredentialFields();
        if (!fields || !fields.pw) return;
        var pw = fields.pw.value || '';
        if (pw.length < 2) return;
        var user = (fields.user && fields.user.value) ? fields.user.value.trim() : '';
        var host = location.hostname || '';
        if (!host || host === 'localhost' || host === '127.0.0.1') return;
        try {
          window.webkit.messageHandlers.irisWebView.postMessage({
            action: 'saveCredentials',
            host: host,
            username: user,
            password: pw
          });
          showSavedBanner(host);
        } catch (_) {}
      }

      document.addEventListener('submit', captureAndSave, true);
      document.addEventListener('click', function(ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('button, input[type="submit"], [role="button"]') : null;
        if (btn) {
          var fields = findCredentialFields();
          if (fields && fields.pw && fields.pw.value && fields.pw.value.length >= 2) {
            captureAndSave();
          }
        }
      }, true);

      requestFillIfReady();
      var obs = new MutationObserver(function() { requestFillIfReady(); });
      if (document.documentElement) obs.observe(document.documentElement, { childList: true, subtree: true });
    })();
    """
  }

  private func normalizeCredentialHost(_ host: String) -> String {
    let lower = host.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    if lower.hasPrefix("www.") {
      return String(lower.dropFirst(4))
    }
    return lower
  }

  private func saveCredentialToIrisVault(host: String, username: String, password: String) {
    let cleanHost = normalizeCredentialHost(host)
    guard !cleanHost.isEmpty, !password.isEmpty else { return }
    guard let base = URL(string: "/api/passwords/save", relativeTo: targetURL) else { return }
    var req = URLRequest(url: base)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let payload: [String: String] = ["host": cleanHost, "username": username, "password": password]
    req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
    URLSession.shared.dataTask(with: req).resume()
  }

  private func loadCredentialFromIrisVault(host: String, completion: @escaping (String, String) -> Void) {
    let cleanHost = normalizeCredentialHost(host)
    guard !cleanHost.isEmpty,
          var comps = URLComponents(url: targetURL, resolvingAgainstBaseURL: true) else { return }
    comps.path = "/api/passwords/get"
    comps.queryItems = [URLQueryItem(name: "host", value: cleanHost)]
    guard let url = comps.url else { return }
    URLSession.shared.dataTask(with: url) { data, _, _ in
      guard let data = data,
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            (obj["found"] as? Bool) == true,
            let pw = obj["password"] as? String else { return }
      let user = (obj["username"] as? String) ?? ""
      DispatchQueue.main.async {
        completion(user, pw)
      }
    }.resume()
  }

  private func buildWebConfig(withBridge: Bool, injectTvNav: Bool = false, injectPasswordManager: Bool = false) -> WKWebViewConfiguration {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = WKWebsiteDataStore.default()
    config.suppressesIncrementalRendering = false
    config.mediaTypesRequiringUserActionForPlayback = []
    config.allowsAirPlayForMediaPlayback = true
    config.preferences.setValue(true, forKey: "fullScreenEnabled")
    config.preferences.setValue(true, forKey: "acceleratedDrawingEnabled")
    config.preferences.setValue(true, forKey: "canvasUsesAcceleratedDrawing")
    config.preferences.setValue(true, forKey: "webGLEnabled")
    if withBridge {
      config.userContentController.add(self, name: "irisWebView")
    }
    if injectTvNav {
      if cachedTvNavScript == nil { cachedTvNavScript = loadTvSpatialNavScript() }
      if let scriptSource = cachedTvNavScript {
        let userScript = WKUserScript(
          source: scriptSource,
          injectionTime: .atDocumentEnd,
          forMainFrameOnly: true
        )
        config.userContentController.addUserScript(userScript)
      }
    }
    if injectPasswordManager {
      if cachedPwScript == nil { cachedPwScript = passwordManagerScriptSource() }
      if let pwSource = cachedPwScript {
        let pwScript = WKUserScript(
          source: pwSource,
          injectionTime: .atDocumentEnd,
          forMainFrameOnly: false
        )
        config.userContentController.addUserScript(pwScript)
      }
    }
    return config
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024, diskCapacity: 512 * 1024 * 1024, diskPath: "iris_url_cache")
    if cachedTvNavScript == nil { cachedTvNavScript = loadTvSpatialNavScript() }
    if cachedPwScript == nil { cachedPwScript = passwordManagerScriptSource() }
    setupMainMenu()
    if let iconPath = Bundle.main.path(forResource: "AppIcon", ofType: "icns"),
       let icon = NSImage(contentsOfFile: iconPath) {
      NSApp.applicationIconImage = icon
    }

    let frame = NSRect(x: 0, y: 0, width: 1440, height: 860)
    window = NSWindow(
      contentRect: frame,
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "irisTV"
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = false
    window.appearance = NSAppearance(named: .darkAqua)
    window.backgroundColor = NSColor(calibratedRed: 0.047, green: 0.071, blue: 0.125, alpha: 1.0)
    window.collectionBehavior = [.fullScreenPrimary]
    window.minSize = NSSize(width: 960, height: 600)
    window.center()

    let contentBounds = window.contentView!.bounds
    let rootView = NSView(frame: contentBounds)
    rootView.autoresizingMask = [.width, .height]
    window.contentView = rootView

    webView = WKWebView(frame: contentBounds, configuration: buildWebConfig(withBridge: true))
    webView.autoresizingMask = [.width, .height]
    webView.wantsLayer = true
    webView.layer?.drawsAsynchronously = true
    webView.uiDelegate = self
    webView.setValue(false, forKey: "drawsBackground")
    rootView.addSubview(webView)

    setupAppContainer(rootView: rootView, bounds: contentBounds)

    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    window.makeFirstResponder(webView)
    applyGpuPreference("dedicated")
    setupHardwareRemoteMonitor()
    ensureServerRunning()
    let url = self.targetURL
    self.webView.load(URLRequest(url: url))
  }

  private var hwThrottle: [String: Date] = [:]

  private func dispatchHwAction(_ action: String) {
    let now = Date()
    if let last = hwThrottle[action], now.timeIntervalSince(last) < 0.14 {
      return
    }
    hwThrottle[action] = now

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let safeAction = action.replacingOccurrences(of: "'", with: "")
      if !self.appContainer.isHidden {
        if safeAction == "menu" {
          self.closeEmbeddedAppAction()
          return
        }
        let js = "if (window.__irisHwEvent) { window.__irisHwEvent('\(safeAction)'); } else if ('\(safeAction)' === 'back') { window.webkit.messageHandlers.irisWebView.postMessage({action:'closeApp'}); }"
        self.appWebView?.evaluateJavaScript(js, completionHandler: nil)
        return
      }
      let js = "window.__irisHwEvent && window.__irisHwEvent('\(safeAction)');"
      self.webView?.evaluateJavaScript(js, completionHandler: nil)
    }
  }

  private func bindController(_ controller: GCController) {
    if let ext = controller.extendedGamepad {
      ext.dpad.up.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("up") } }
      ext.dpad.down.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("down") } }
      ext.dpad.left.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("left") } }
      ext.dpad.right.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("right") } }
      ext.buttonA.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("ok") } }
      ext.buttonB.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("back") } }
      ext.buttonX.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("playPause") } }
      ext.buttonY.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("keyboard") } }
      ext.leftShoulder.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("volDown") } }
      ext.rightShoulder.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("volUp") } }
      ext.buttonMenu.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("menu") } }
    } else if let micro = controller.microGamepad {
      micro.dpad.up.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("up") } }
      micro.dpad.down.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("down") } }
      micro.dpad.left.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("left") } }
      micro.dpad.right.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("right") } }
      micro.buttonA.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("ok") } }
      micro.buttonX.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("playPause") } }
      micro.buttonMenu.pressedChangedHandler = { [weak self] _, _, pressed in if pressed { self?.dispatchHwAction("back") } }
    }
  }

  private func setupHardwareRemoteMonitor() {
    NSEvent.addLocalMonitorForEvents(matching: [.systemDefined]) { [weak self] event in
      if event.subtype.rawValue == 8 {
        let data1 = event.data1
        let keyCode = (data1 & 0xFFFF0000) >> 16
        let keyFlags = (data1 & 0x0000FFFF)
        let isKeyDown = ((keyFlags & 0xFF00) >> 8) == 0xA
        if isKeyDown {
          switch keyCode {
          case 0: self?.dispatchHwAction("volUp")
          case 1: self?.dispatchHwAction("volDown")
          case 7: self?.dispatchHwAction("mute")
          case 16: self?.dispatchHwAction("playPause")
          case 17, 19: self?.dispatchHwAction("next")
          case 18, 20: self?.dispatchHwAction("prev")
          default: break
          }
        }
      }
      return event
    }

    NotificationCenter.default.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] note in
      if let ctrl = note.object as? GCController {
        self?.bindController(ctrl)
      }
    }
    for ctrl in GCController.controllers() {
      bindController(ctrl)
    }
    GCController.startWirelessControllerDiscovery(completionHandler: nil)
  }

  private func setupAppContainer(rootView: NSView, bounds: NSRect) {
    appContainer = NSView(frame: bounds)
    appContainer.autoresizingMask = [.width, .height]
    appContainer.wantsLayer = true
    appContainer.layer?.backgroundColor = NSColor(calibratedRed: 0.047, green: 0.071, blue: 0.125, alpha: 1.0).cgColor
    appContainer.isHidden = true

    appHeaderBar = NSView()
    appHeaderBar.wantsLayer = true
    appHeaderBar.layer?.backgroundColor = NSColor(calibratedRed: 0.055, green: 0.078, blue: 0.135, alpha: 1.0).cgColor
    appHeaderBar.translatesAutoresizingMaskIntoConstraints = false

    let borderLine = NSView()
    borderLine.wantsLayer = true
    borderLine.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.10).cgColor
    borderLine.translatesAutoresizingMaskIntoConstraints = false
    appHeaderBar.addSubview(borderLine)

    let backBtn = NSButton(title: "← Voltar para irisTV", target: self, action: #selector(closeEmbeddedAppAction))
    backBtn.bezelStyle = .rounded
    backBtn.controlSize = .regular
    backBtn.font = NSFont.systemFont(ofSize: 12.5, weight: .semibold)
    backBtn.translatesAutoresizingMaskIntoConstraints = false

    appTitleLabel = NSTextField(labelWithString: "App")
    appTitleLabel.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
    appTitleLabel.textColor = NSColor.white.withAlphaComponent(0.88)
    appTitleLabel.translatesAutoresizingMaskIntoConstraints = false

    let reloadBtn = NSButton(title: "↻ Recarregar", target: self, action: #selector(reloadEmbeddedAppAction))
    reloadBtn.bezelStyle = .rounded
    reloadBtn.controlSize = .regular
    reloadBtn.font = NSFont.systemFont(ofSize: 12, weight: .medium)
    reloadBtn.translatesAutoresizingMaskIntoConstraints = false

    appHeaderBar.addSubview(backBtn)
    appHeaderBar.addSubview(appTitleLabel)
    appHeaderBar.addSubview(reloadBtn)

    appWebViewSlot = NSView()
    appWebViewSlot.wantsLayer = true
    appWebViewSlot.layer?.backgroundColor = NSColor(calibratedRed: 0.04, green: 0.05, blue: 0.09, alpha: 1.0).cgColor
    appWebViewSlot.translatesAutoresizingMaskIntoConstraints = false

    snapshotImageView = NSImageView()
    snapshotImageView.imageScaling = .scaleAxesIndependently
    snapshotImageView.wantsLayer = true
    snapshotImageView.translatesAutoresizingMaskIntoConstraints = false
    snapshotImageView.isHidden = true
    appWebViewSlot.addSubview(snapshotImageView)

    appContainer.addSubview(appHeaderBar)
    appContainer.addSubview(appWebViewSlot)

    NSLayoutConstraint.activate([
      appHeaderBar.topAnchor.constraint(equalTo: appContainer.topAnchor),
      appHeaderBar.leadingAnchor.constraint(equalTo: appContainer.leadingAnchor),
      appHeaderBar.trailingAnchor.constraint(equalTo: appContainer.trailingAnchor),
      appHeaderBar.heightAnchor.constraint(equalToConstant: 40),

      borderLine.leadingAnchor.constraint(equalTo: appHeaderBar.leadingAnchor),
      borderLine.trailingAnchor.constraint(equalTo: appHeaderBar.trailingAnchor),
      borderLine.bottomAnchor.constraint(equalTo: appHeaderBar.bottomAnchor),
      borderLine.heightAnchor.constraint(equalToConstant: 1),

      backBtn.leadingAnchor.constraint(equalTo: appHeaderBar.leadingAnchor, constant: 14),
      backBtn.centerYAnchor.constraint(equalTo: appHeaderBar.centerYAnchor),

      appTitleLabel.centerXAnchor.constraint(equalTo: appHeaderBar.centerXAnchor),
      appTitleLabel.centerYAnchor.constraint(equalTo: appHeaderBar.centerYAnchor),

      reloadBtn.trailingAnchor.constraint(equalTo: appHeaderBar.trailingAnchor, constant: -14),
      reloadBtn.centerYAnchor.constraint(equalTo: appHeaderBar.centerYAnchor),

      appWebViewSlot.topAnchor.constraint(equalTo: appHeaderBar.bottomAnchor),
      appWebViewSlot.leadingAnchor.constraint(equalTo: appContainer.leadingAnchor),
      appWebViewSlot.trailingAnchor.constraint(equalTo: appContainer.trailingAnchor),
      appWebViewSlot.bottomAnchor.constraint(equalTo: appContainer.bottomAnchor),

      snapshotImageView.topAnchor.constraint(equalTo: appWebViewSlot.topAnchor),
      snapshotImageView.leadingAnchor.constraint(equalTo: appWebViewSlot.leadingAnchor),
      snapshotImageView.trailingAnchor.constraint(equalTo: appWebViewSlot.trailingAnchor),
      snapshotImageView.bottomAnchor.constraint(equalTo: appWebViewSlot.bottomAnchor)
    ])

    rootView.addSubview(appContainer)
  }

  private func openEmbeddedApp(url: URL, name: String, appId: String? = nil) {
    appContainer.layoutSubtreeIfNeeded()

    let appKey = (appId ?? url.host?.lowercased() ?? "app")
      .replacingOccurrences(of: "www.", with: "")
      .replacingOccurrences(of: ".com", with: "")
      .replacingOccurrences(of: ".tv", with: "")
      .replacingOccurrences(of: ".", with: "_")
    let isYouTube = (url.host?.lowercased().contains("youtube.com") == true)

    // Cenário 1: App já aquecido na memória (Warm Pool) -> ABERTURA INSTANTÂNEA EM 0ms!
    if let warmView = warmAppViews[appKey] {
      NSLog("[irisTV FastSwitch] Resumindo instantaneamente '%@' em 0ms (Apple TV Fast Switch)", appKey)
      appWebViewSlot.subviews.forEach { sub in
        if sub != warmView && sub != snapshotImageView { sub.isHidden = true }
      }
      snapshotImageView.isHidden = true
      warmView.frame = appWebViewSlot.bounds
      warmView.isHidden = false
      appWebView = warmView
      currentAppKey = appKey
      currentAppUrl = warmView.url ?? url

      appTitleLabel.stringValue = "\(name)  •  Setas: Navegar  |  F2: Cursor Virtual  |  ESC: Voltar ao irisTV"
      appContainer.isHidden = false
      window.makeFirstResponder(warmView)

      warmAppLru.removeAll(where: { $0 == appKey })
      warmAppLru.append(appKey)

      warmView.evaluateJavaScript("window.dispatchEvent(new Event('iris-app-resume'));", completionHandler: nil)
      return
    }

    // Cenário 2: Cold Start com Restauração de Sessão e Snapshot Instantâneo
    let isNetflix = (url.host?.lowercased().contains("netflix.com") == true)
    var finalUrl: URL = {
      if isYouTube && (url.path.isEmpty || url.path == "/") {
        return URL(string: "https://www.youtube.com/tv") ?? url
      }
      if isNetflix && (url.path.isEmpty || url.path == "/") {
        return URL(string: "https://www.netflix.com/browse") ?? url
      }
      return url
    }()

    if let session = loadAppSession(key: appKey),
       let savedUrlStr = session["url"] as? String,
       let savedUrl = URL(string: savedUrlStr),
       !savedUrlStr.isEmpty {
      NSLog("[irisTV Session] Restaurando sessão salva para '%@': %@", appKey, savedUrlStr)
      finalUrl = savedUrl
    }

    if let snap = loadSnapshot(key: appKey) {
      snapshotImageView.image = snap
      snapshotImageView.alphaValue = 1.0
      snapshotImageView.isHidden = false
    } else {
      snapshotImageView.isHidden = true
    }

    let dynamicView = WKWebView(frame: appWebViewSlot.bounds, configuration: buildWebConfig(withBridge: true, injectTvNav: !isYouTube, injectPasswordManager: true))
    dynamicView.autoresizingMask = [.width, .height]
    dynamicView.wantsLayer = true
    dynamicView.layer?.drawsAsynchronously = true
    if isYouTube {
      dynamicView.customUserAgent = "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 TV Safari/537.36"
    } else {
      dynamicView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
    }
    dynamicView.uiDelegate = self
    dynamicView.navigationDelegate = self
    dynamicView.allowsBackForwardNavigationGestures = true

    appWebViewSlot.subviews.forEach { sub in
      if sub != snapshotImageView { sub.isHidden = true }
    }
    appWebViewSlot.addSubview(dynamicView)
    warmAppViews[appKey] = dynamicView
    warmAppLru.append(appKey)

    appWebView = dynamicView
    currentAppKey = appKey
    currentAppUrl = finalUrl

    appTitleLabel.stringValue = "\(name)  •  Setas: Navegar  |  F2: Cursor Virtual  |  ESC: Voltar ao irisTV"
    appContainer.isHidden = false
    window.makeFirstResponder(dynamicView)

    dynamicView.load(URLRequest(url: finalUrl))
  }

  @objc func closeEmbeddedAppAction() {
    guard let key = currentAppKey, let active = appWebView else {
      appContainer.isHidden = true
      currentAppUrl = nil
      window.makeFirstResponder(webView)
      return
    }

    // 1. Snapshot da tela atual para exibição imediata em 0ms no próximo retorno
    UserDefaults.standard.set(key, forKey: "iris_last_active_app")
    active.takeSnapshot(with: nil) { [weak self] img, _ in
      if let img = img { self?.saveSnapshot(key: key, image: img) }
    }

    // 2. Extrai e salva URL exata e rolagem na sessão persistente
    active.evaluateJavaScript("""
      JSON.stringify({
        url: window.location.href,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0
      })
    """) { [weak self] res, _ in
      guard let self = self,
            let jsonStr = res as? String,
            let data = jsonStr.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let savedUrl = obj["url"] as? String else { return }
      self.saveAppSession(
        key: key,
        url: savedUrl,
        scrollX: obj["scrollX"] as? Double ?? 0,
        scrollY: obj["scrollY"] as? Double ?? 0
      )
    }

    // 3. Suspensão com Ultra-baixa RAM: pausa vídeos e áudios para liberar decodificadores de hardware
    active.evaluateJavaScript("""
      document.querySelectorAll('video, audio').forEach(function(m) {
        try { m.pause(); } catch(_) {}
      });
      window.dispatchEvent(new Event('iris-app-suspend'));
    """, completionHandler: nil)

    active.isHidden = true

    // 4. Estratégia Jetsam / LRU (mantém no máximo maxWarmApps em RAM)
    if warmAppLru.count > maxWarmApps {
      let oldestKey = warmAppLru.removeFirst()
      if let evicted = warmAppViews.removeValue(forKey: oldestKey) {
        NSLog("[irisTV FastSwitch] Liberando memória do app mais antigo (Jetsam): %@", oldestKey)
        evicted.stopLoading()
        evicted.uiDelegate = nil
        evicted.navigationDelegate = nil
        evicted.removeFromSuperview()
      }
    }

    appContainer.isHidden = true
    currentAppKey = nil
    currentAppUrl = nil
    window.makeFirstResponder(webView)
  }

  @objc func reloadEmbeddedAppAction() {
    appWebView?.reload()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    return true
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let dict = message.body as? [String: Any], let action = dict["action"] as? String else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      if action == "toggleFullscreen" {
        self.window.toggleFullScreen(nil)
      } else if action == "quit" {
        NSApp.terminate(nil)
      } else if action == "reload" {
        if self.appContainer.isHidden { self.webView.reload() }
        else { self.appWebView?.reload() }
      } else if action == "closeApp" {
        self.closeEmbeddedAppAction()
      } else if action == "openAppUrl", let urlStr = dict["url"] as? String, let u = URL(string: urlStr) {
        let name = (dict["name"] as? String) ?? "App"
        let appId = dict["id"] as? String
        self.openEmbeddedApp(url: u, name: name, appId: appId)
      } else if action == "openExternal", let urlStr = dict["url"] as? String, let u = URL(string: urlStr) {
        let name = (dict["name"] as? String) ?? (u.host ?? "App")
        let appId = dict["id"] as? String
        self.openEmbeddedApp(url: u, name: name, appId: appId)
      } else if action == "saveCredentials", let host = dict["host"] as? String, let password = dict["password"] as? String {
        let username = (dict["username"] as? String) ?? ""
        self.saveCredentialToIrisVault(host: host, username: username, password: password)
      } else if action == "setGpuPreference", let pref = dict["preference"] as? String {
        self.applyGpuPreference(pref)
      } else if action == "getCredentials", let host = dict["host"] as? String {
        self.loadCredentialFromIrisVault(host: host) { [weak self] username, password in
          guard let uData = try? JSONSerialization.data(withJSONObject: username),
                let pData = try? JSONSerialization.data(withJSONObject: password),
                let uJson = String(data: uData, encoding: .utf8),
                let pJson = String(data: pData, encoding: .utf8) else { return }
          self?.appWebView?.evaluateJavaScript("window.__irisFillCredentials && window.__irisFillCredentials(\(uJson), \(pJson));", completionHandler: nil)
        }
      }
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if webView == self.appWebView {
      if let snapView = self.snapshotImageView, !snapView.isHidden {
        NSAnimationContext.runAnimationGroup({ ctx in
          ctx.duration = 0.12
          snapView.animator().alphaValue = 0.0
        }, completionHandler: {
          snapView.isHidden = true
          snapView.alphaValue = 1.0
        })
      }
      if let key = self.currentAppKey, let session = self.loadAppSession(key: key) {
        let sx = session["scrollX"] as? Double ?? 0
        let sy = session["scrollY"] as? Double ?? 0
        if sx > 0 || sy > 0 {
          webView.evaluateJavaScript("window.scrollTo(\(sx), \(sy));", completionHandler: nil)
        }
      }
      if let currentUrl = webView.url?.absoluteString, let key = self.currentAppKey {
        self.saveAppSession(key: key, url: currentUrl)
      }
    }
  }

  func webView(
    _ webView: WKWebView,
    runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.canChooseFiles = true
    panel.canChooseDirectories = parameters.allowsDirectories
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.resolvesAliases = true
    panel.beginSheetModal(for: window) { response in
      if response == .OK {
        completionHandler(panel.urls)
      } else {
        completionHandler(nil)
      }
    }
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url {
      if webView == self.appWebView {
        webView.load(URLRequest(url: url))
      } else {
        NSWorkspace.shared.open(url)
      }
    }
    return nil
  }

  @objc func toggleFullScreenAction() {
    window.toggleFullScreen(nil)
  }

  @objc func reloadAction() {
    if appContainer.isHidden { webView.reload() }
    else { appWebView?.reload() }
  }

  @objc func switchToLightningAction() {
    if let url = URL(string: "http://127.0.0.1:3000/lightning/index.html") {
      webView.load(URLRequest(url: url))
    }
  }

  @objc func switchToClassicAction() {
    if let url = URL(string: "http://127.0.0.1:3000/index.html") {
      webView.load(URLRequest(url: url))
    }
  }

  private func setupMainMenu() {
    let mainMenu = NSMenu()
    let appItem = NSMenuItem()
    mainMenu.addItem(appItem)

    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "Sobre o irisTV", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Voltar para irisTV", action: #selector(closeEmbeddedAppAction), keyEquivalent: "[")
    appMenu.addItem(withTitle: "Tela Cheia", action: #selector(toggleFullScreenAction), keyEquivalent: "f")
    appMenu.addItem(withTitle: "Recarregar", action: #selector(reloadAction), keyEquivalent: "r")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Encerrar irisTV", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu

    let engineMenu = NSMenu(title: "Motor")
    engineMenu.addItem(withTitle: "irisTV Lightning (60 FPS WebGL)", action: #selector(switchToLightningAction), keyEquivalent: "1")
    engineMenu.addItem(withTitle: "irisTV Clássico (HTML/DOM)", action: #selector(switchToClassicAction), keyEquivalent: "2")
    let engineItem = NSMenuItem(title: "Motor Gráfico", action: nil, keyEquivalent: "")
    engineItem.submenu = engineMenu
    mainMenu.addItem(engineItem)

    NSApp.mainMenu = mainMenu
  }
}

let defaultUrlString = "http://127.0.0.1:3000/index.html"
let rawUrl = CommandLine.arguments.dropFirst().first ?? defaultUrlString
let url = URL(string: rawUrl) ?? URL(string: defaultUrlString)!
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = IrisAppDelegate(url: url)
app.delegate = delegate
app.run()
