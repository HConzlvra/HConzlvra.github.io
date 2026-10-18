import SwiftUI
import UIKit
import WebKit

private let siteURL = URL(string: "https://hconzlvra.top")!

private enum SiteSection: String, CaseIterable, Identifiable, Hashable {
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

private enum AppTab: Hashable {
    case home
    case posts
    case bruh
    case more
    case search
}

struct ContentView: View {
    @State private var selectedTab: AppTab = .home
    @State private var currentSection: SiteSection = .home
    @State private var moreSection: SiteSection?
    @State private var isMorePresented = false
    @State private var isDark = true
    @State private var searchText = ""
    @State private var searchURL = URL(string: "https://hconzlvra.top/search")!
    @State private var themeID = UUID()

    var body: some View {
        Group {
            if #available(iOS 26.0, *) {
                nativeTabView
            } else {
                compatibleTabView
            }
        }
        .overlay(alignment: .top) {
            topBar
                .padding(.horizontal, 18)
                .padding(.top, 8)
        }
        .preferredColorScheme(isDark ? .dark : .light)
        .tint(Color(red: 0.82, green: 0.37, blue: 0.77))
    }

    @available(iOS 26.0, *)
    private var nativeTabView: some View {
        TabView(selection: $selectedTab) {
            Tab("Home", systemImage: "house", value: .home) {
                sitePage(.home)
            }
            Tab("Posts", systemImage: "text.alignleft", value: .posts) {
                sitePage(.posts)
            }
            Tab("Bruh", systemImage: "sparkles", value: .bruh) {
                sitePage(.bruh)
            }
            Tab("More", systemImage: "ellipsis", value: .more) {
                morePages
            }
            Tab("Search", systemImage: "magnifyingglass", value: .search, role: .search) {
                WebView(
                    requestedURL: searchURL,
                    themeID: themeID,
                    selectedSection: $currentSection,
                    isDark: $isDark
                )
            }
        }
        .searchable(text: $searchText, prompt: "搜索本站")
        .onSubmit(of: .search, performSearch)
        .onChange(of: selectedTab) { _, tab in
            if tab == .more { isMorePresented = true }
        }
        .sheet(isPresented: $isMorePresented) {
            moreMenu
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var compatibleTabView: some View {
        TabView(selection: $selectedTab) {
            sitePage(.home)
                .tabItem { Label("Home", systemImage: "house") }
                .tag(AppTab.home)
            sitePage(.posts)
                .tabItem { Label("Posts", systemImage: "text.alignleft") }
                .tag(AppTab.posts)
            sitePage(.bruh)
                .tabItem { Label("Bruh", systemImage: "sparkles") }
                .tag(AppTab.bruh)
            morePages
                .tabItem { Label("More", systemImage: "ellipsis") }
                .tag(AppTab.more)
        }
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            if selectedTab == .more, moreSection != nil {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        moreSection = nil
                        currentSection = .home
                        isMorePresented = true
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 30, height: 34)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("返回 More")
            }
            Text(currentTitle)
                .font(.system(size: 27, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)

            Text("HC")
                .font(.system(size: 23, weight: .black, design: .serif).italic())
                .foregroundStyle(Color(red: 0.87, green: 0.35, blue: 0.75))
                .accessibilityLabel("HConzlvra")

            Button {
                withAnimation(.easeInOut(duration: 0.25)) {
                    isDark.toggle()
                    themeID = UUID()
                }
            } label: {
                Capsule()
                    .fill(isDark ? Color(red: 0.16, green: 0.16, blue: 0.16) : Color(red: 0.89, green: 0.89, blue: 0.89))
                    .frame(width: 42, height: 24)
                    .overlay(alignment: isDark ? .trailing : .leading) {
                        Circle()
                            .fill(isDark ? Color.black.opacity(0.72) : Color.white)
                            .frame(width: 19, height: 19)
                            .overlay {
                                Image(systemName: isDark ? "moon.fill" : "sun.max.fill")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(isDark ? .white : .black.opacity(0.75))
                            }
                            .padding(2.5)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isDark ? "切换浅色主题" : "切换深色主题")
            .accessibilityAddTraits(.isButton)
        }
        .padding(.vertical, 8)
        .background {
            LinearGradient(
                colors: [Color(uiColor: .systemBackground).opacity(0.94), Color(uiColor: .systemBackground).opacity(0.68), .clear],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(edges: .top)
        }
    }

    private var morePages: some View {
        Group {
            if let moreSection {
                sitePage(moreSection)
            } else {
                List([SiteSection.about, .docs, .archive, .guestbook]) { section in
                    Button {
                        moreSection = section
                        currentSection = section
                    } label: {
                        Label(section.rawValue, systemImage: section.symbol)
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
        }
    }

    private var moreMenu: some View {
        NavigationStack {
            List([SiteSection.about, .docs, .archive, .guestbook]) { section in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        moreSection = section
                        currentSection = section
                        isMorePresented = false
                    }
                } label: {
                    Label(section.rawValue, systemImage: section.symbol)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var currentTitle: String {
        if selectedTab == .search { return "Search" }
        if selectedTab == .more && moreSection == nil { return "More" }
        if selectedTab == .home { return "Home" }
        if selectedTab == .posts { return "Posts" }
        if selectedTab == .bruh { return "Bruh" }
        return currentSection.rawValue
    }

    private func sitePage(_ section: SiteSection) -> some View {
        WebView(
            requestedURL: URL(string: siteURL.absoluteString + section.path) ?? siteURL,
            themeID: themeID,
            selectedSection: $currentSection,
            isDark: $isDark
        )
        .id(section)
    }

    private func performSearch() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty, var components = URLComponents(string: siteURL.absoluteString + "/search") else { return }
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let url = components.url else { return }
        searchURL = url
        currentSection = .home
        selectedTab = .search
    }

}

private struct WebView: UIViewRepresentable {
    let requestedURL: URL
    let themeID: UUID
    @Binding var selectedSection: SiteSection
    @Binding var isDark: Bool

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let hideWebNavigation = """
        (() => {
          const style = document.createElement('style');
          style.textContent = '#nav-wrap, .theme-toggle-float { display: none !important; }';
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
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        context.coordinator.lastThemeID = themeID
        context.coordinator.lastRequestedURL = requestedURL
        webView.load(URLRequest(url: requestedURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onSectionChange = { section in
            guard let section else { return }
            DispatchQueue.main.async { selectedSection = section }
        }
        context.coordinator.onThemeChange = { dark in
            DispatchQueue.main.async { isDark = dark }
        }

        if context.coordinator.lastRequestedURL != requestedURL {
            context.coordinator.lastRequestedURL = requestedURL
            webView.load(URLRequest(url: requestedURL))
        }

        if context.coordinator.lastThemeID != themeID {
            context.coordinator.lastThemeID = themeID
            let theme = isDark ? "dark" : "light"
            context.coordinator.preferredTheme = theme
            let script = "document.documentElement.setAttribute('data-theme', '\(theme)'); localStorage.setItem('theme', '\(theme)');"
            webView.evaluateJavaScript(script)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var lastRequestedURL: URL?
        var lastThemeID: UUID?
        var preferredTheme: String?
        var onSectionChange: ((SiteSection?) -> Void)?
        var onThemeChange: ((Bool) -> Void)?

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard let url = webView.url else { return }
            onSectionChange?(SiteSection.matching(path: url.path))
            if let preferredTheme {
                let script = "document.documentElement.setAttribute('data-theme', '\(preferredTheme)'); localStorage.setItem('theme', '\(preferredTheme)');"
                webView.evaluateJavaScript(script)
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
            guard let url = navigationAction.request.url, let host = url.host?.lowercased() else {
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
