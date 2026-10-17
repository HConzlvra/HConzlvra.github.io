import SwiftUI
import UIKit
import WebKit

private let siteURL = URL(string: "https://hconzlvra.top")!

private enum SiteSection: String, CaseIterable, Identifiable {
    case home = "Home"
    case about = "About"
    case posts = "Posts"
    case docs = "Docs"
    case archive = "Archive"
    case guestbook = "Guestbook"
    case bruh = "Bruh"

    var id: String { rawValue }

    var path: String {
        switch self {
        case .home: "/"
        case .about: "/about"
        case .posts: "/posts"
        case .docs: "/docs"
        case .archive: "/archive"
        case .guestbook: "/guestbook"
        case .bruh: "/bruh"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .about: "person.crop.circle"
        case .posts: "text.alignleft"
        case .docs: "book.closed"
        case .archive: "archivebox"
        case .guestbook: "bubble.left.and.bubble.right"
        case .bruh: "sparkles"
        }
    }

    static func matching(path: String) -> SiteSection? {
        allCases.first { section in
            section.path == "/" ? path == "/" : path == section.path || path.hasPrefix(section.path + "/")
        }
    }
}

struct ContentView: View {
    @State private var selectedSection: SiteSection? = .home
    @State private var isDark = true
    @State private var searchText = ""
    @State private var requestedURL = siteURL
    @State private var navigationID = UUID()
    @State private var themeID = UUID()

    var body: some View {
        WebView(
            requestedURL: requestedURL,
            navigationID: navigationID,
            themeID: themeID,
            selectedSection: $selectedSection,
            isDark: $isDark
        )
        .background(Color.black)
        .safeAreaInset(edge: .top, spacing: 0) {
            topBar
                .padding(.horizontal, 16)
                .padding(.top, 6)
                .padding(.bottom, 8)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomBar
                .padding(.horizontal, 10)
                .padding(.top, 8)
                .padding(.bottom, 4)
        }
        .preferredColorScheme(isDark ? .dark : .light)
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            Button {
                isDark.toggle()
                themeID = UUID()
            } label: {
                Image(systemName: isDark ? "sun.max.fill" : "moon.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 44)
                    .modifier(LiquidGlass(shape: .circle))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isDark ? "切换浅色主题" : "切换深色主题")

            HStack(spacing: 9) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.secondary)

                TextField("搜索本站", text: $searchText)
                    .font(.system(size: 15))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit(performSearch)

                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("清除搜索")
                }

                Button(action: performSearch) {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("搜索")
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .modifier(LiquidGlass(shape: .capsule))
        }
    }

    private var bottomBar: some View {
        HStack(spacing: 0) {
            ForEach(SiteSection.allCases) { section in
                Button {
                    selectedSection = section
                    requestedURL = URL(string: siteURL.absoluteString + section.path) ?? siteURL
                    navigationID = UUID()
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: section.symbol)
                            .font(.system(size: 16, weight: selectedSection == section ? .semibold : .regular))
                            .frame(height: 18)
                        Text(section.rawValue)
                            .font(.system(size: 9, weight: selectedSection == section ? .semibold : .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(selectedSection == section ? Color.accentColor : Color.primary.opacity(0.78))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(section.rawValue)
                .accessibilityAddTraits(selectedSection == section ? .isSelected : [])
            }
        }
        .padding(.horizontal, 5)
        .padding(.vertical, 4)
        .modifier(LiquidGlass(shape: .capsule))
    }

    private func performSearch() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty,
              var components = URLComponents(string: siteURL.absoluteString + "/search") else {
            return
        }
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let url = components.url else { return }
        selectedSection = nil
        requestedURL = url
        navigationID = UUID()
    }
}

private struct LiquidGlass: ViewModifier {
    enum Shape {
        case circle
        case capsule
    }

    let shape: Shape

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            switch shape {
            case .circle:
                content.glassEffect(.regular.interactive(), in: Circle())
            case .capsule:
                content.glassEffect(.regular.interactive(), in: Capsule())
            }
        } else {
            switch shape {
            case .circle:
                content
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.18), lineWidth: 1))
            case .capsule:
                content
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().stroke(.white.opacity(0.18), lineWidth: 1))
            }
        }
    }
}

private struct WebView: UIViewRepresentable {
    let requestedURL: URL
    let navigationID: UUID
    let themeID: UUID
    @Binding var selectedSection: SiteSection?
    @Binding var isDark: Bool

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let hideWebNavigation = """
        (() => {
          const style = document.createElement('style');
          style.textContent = '#nav-wrap, .theme-toggle-float { display: none !important; } body { padding-bottom: 24px !important; }';
          (document.head || document.documentElement).appendChild(style);
        })();
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: hideWebNavigation, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.lastNavigationID = navigationID
        webView.load(URLRequest(url: requestedURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onSectionChange = { section in
            DispatchQueue.main.async { selectedSection = section }
        }
        context.coordinator.onThemeChange = { dark in
            DispatchQueue.main.async { isDark = dark }
        }

        if context.coordinator.lastNavigationID != navigationID {
            context.coordinator.lastNavigationID = navigationID
            webView.evaluateJavaScript("sessionStorage.removeItem('search-query')")
            webView.load(URLRequest(url: requestedURL))
        }

        if context.coordinator.lastThemeID != themeID {
            context.coordinator.lastThemeID = themeID
            let theme = isDark ? "dark" : "light"
            context.coordinator.preferredTheme = theme
            let script = """
            (() => {
              const root = document.documentElement;
              root.classList.add('theme-anim');
              root.setAttribute('data-theme', '\(theme)');
              localStorage.setItem('theme', '\(theme)');
              window.setTimeout(() => root.classList.remove('theme-anim'), 500);
            })();
            """
            webView.evaluateJavaScript(script)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var lastNavigationID: UUID?
        var lastThemeID: UUID?
        var preferredTheme: String?
        var onSectionChange: ((SiteSection?) -> Void)?
        var onThemeChange: ((Bool) -> Void)?

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard let url = webView.url else { return }
            onSectionChange?(SiteSection.matching(path: url.path))
            if let preferredTheme {
                let syncThemeScript = """
                document.documentElement.setAttribute('data-theme', '\(preferredTheme)');
                localStorage.setItem('theme', '\(preferredTheme)');
                """
                webView.evaluateJavaScript(syncThemeScript)
            }
            webView.evaluateJavaScript("document.documentElement.getAttribute('data-theme')") { [weak self] value, _ in
                guard let theme = value as? String else { return }
                self?.onThemeChange?(theme == "dark")
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url,
                  let host = url.host?.lowercased() else {
                decisionHandler(.allow)
                return
            }

            if host == "hconzlvra.top" || host == "www.hconzlvra.top" {
                decisionHandler(.allow)
            } else if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
                decisionHandler(.cancel)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }
    }
}
