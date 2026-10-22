import UIKit
import XCTest

/// The sheet on screen is the one Kuito's tree holds, however fast the app
/// opens and closes sheets: UIKit drops a present or dismiss sent while
/// another transition runs, so the renderer must not send one.
@MainActor
final class KuitoRendererSheetTests: XCTestCase {
    private var window: UIWindow!
    private var renderer: KuitoUIKitRenderer!
    private let screen: UInt32 = 1

    override func setUp() async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene, "the test host's scene")
        let host = UIViewController()

        window = UIWindow(windowScene: scene)
        window.rootViewController = host
        window.makeKeyAndVisible()
        renderer = KuitoUIKitRenderer(container: host.view)
        try renderer.createView(id: screen, kind: "Box", parent: 0, label: "screen")
    }

    override func tearDown() async throws {
        window.isHidden = true
        window = nil
    }

    func testASheetOpenedWhileAnotherPresentsReplacesIt() throws {
        try openSheet(2)
        waitUntil("the first sheet starts presenting") { presented() != nil }

        try renderer.removeView(id: 2)
        try openSheet(3)

        let next = try XCTUnwrap(renderer.nodes[3]?.view)

        waitUntil("the second sheet is the one up") { presented()?.view === next && presented()?.isBeingPresented == false }
        XCTAssertNil(presented()?.presentedViewController, "nothing stacks over the second sheet")
    }

    func testAModalIsAPageSheetAtFullHeight() throws {
        try renderer.createView(id: 2, kind: "Sheet", parent: screen, label: "modal")
        try renderer.setProperty(id: 2, name: "presentation", value: .enumValue(1, "modal"))
        try renderer.setProperty(id: 2, name: "open", value: .bool(true))
        waitUntil("the modal is up") { presented()?.isBeingPresented == false }

        let modal = try XCTUnwrap(presented())

        XCTAssertEqual(modal.modalPresentationStyle, .pageSheet)
        XCTAssertEqual(modal.sheetPresentationController?.detents.map(\.identifier), [.large])
        XCTAssertEqual(modal.sheetPresentationController?.prefersGrabberVisible, false)
    }

    func testAFullScreenPresentationCoversTheScreenAndIsNotSwipedAway() throws {
        try renderer.createView(id: 2, kind: "Sheet", parent: screen, label: "full")
        try renderer.setProperty(id: 2, name: "presentation", value: .enumValue(2, "fullScreen"))
        try renderer.setProperty(id: 2, name: "open", value: .bool(true))
        waitUntil("it is up") { presented()?.isBeingPresented == false }

        let full = try XCTUnwrap(presented())

        XCTAssertEqual(full.modalPresentationStyle, .fullScreen)
        XCTAssertEqual(full.view.frame, window.bounds)
        XCTAssertNil(full.sheetPresentationController, "no sheet to swipe down")
    }

    func testAFullScreenPresentationShowsTheAppsStatusBar() throws {
        let host = LightStatusBarController()

        window.rootViewController = host
        renderer = KuitoUIKitRenderer(container: host.view)
        try renderer.createView(id: screen, kind: "Box", parent: 0, label: "screen")
        try renderer.createView(id: 2, kind: "Sheet", parent: screen, label: "full")
        try renderer.setProperty(id: 2, name: "presentation", value: .enumValue(2, "fullScreen"))
        try renderer.setProperty(id: 2, name: "open", value: .bool(true))
        waitUntil("it is up") { presented()?.isBeingPresented == false }

        let full = try XCTUnwrap(presented())

        // UIKit asks a full-screen cover for the status bar; the app's SystemBars answer at the root.
        XCTAssertEqual(full.preferredStatusBarStyle, .lightContent)
        XCTAssertTrue(full.prefersStatusBarHidden)
    }

    func testAModalHoldsAStackThatAttachesToIt() throws {
        try renderer.createView(id: 2, kind: "Sheet", parent: screen, label: "modal")
        try renderer.setProperty(id: 2, name: "presentation", value: .enumValue(1, "modal"))
        try renderer.createView(id: 3, kind: "NavigationStack", parent: 2, label: "stack")
        try renderer.createView(id: 4, kind: "NavigationScreen", parent: 3, label: "compose")
        try renderer.setProperty(id: 4, name: "title", value: .text("New list"))
        try renderer.setProperty(id: 2, name: "open", value: .bool(true))
        waitUntil("the modal is up") { presented()?.isBeingPresented == false }

        let navigation = try XCTUnwrap(presented()?.children.first as? UINavigationController, "the stack's controller is the modal's child")

        XCTAssertEqual(navigation.topViewController?.navigationItem.title, "New list")
        XCTAssertFalse(navigation.isNavigationBarHidden)
    }

    /// A sheet route's screen is the sheet's only view: its background runs
    /// under the home indicator while its content stays clear of it.
    func testASheetsOnlyViewRunsUnderTheHomeIndicator() throws {
        try renderer.createView(id: 2, kind: "Sheet", parent: screen, label: "sheet")
        try renderer.setProperty(id: 2, name: "snapPoints", value: Structured.snapPoints([.named("72%"), .named("100%")]))
        try renderer.createView(id: 3, kind: "Box", parent: 2, label: "content")
        try renderer.setProperty(id: 3, name: "flexGrow", value: .number(1))
        try renderer.createView(id: 4, kind: "Box", parent: 3, label: "inner")
        try renderer.setProperty(id: 4, name: "flexGrow", value: .number(1))
        try renderer.setProperty(id: 2, name: "open", value: .bool(true))
        waitUntil("the sheet is up") { presented()?.isBeingPresented == false }

        let sheet = try XCTUnwrap(presented()?.view)
        let content = try XCTUnwrap(renderer.nodes[3]?.view)
        let inner = try XCTUnwrap(renderer.nodes[4]?.view)
        let homeIndicator = window.safeAreaInsets.bottom

        sheet.layoutIfNeeded()
        XCTAssertGreaterThan(homeIndicator, 0, "the simulator has a home indicator")
        XCTAssertEqual(content.frame.maxY, sheet.bounds.maxY, accuracy: 0.5, "the content's background reaches the sheet's bottom")
        XCTAssertLessThanOrEqual(
            inner.convert(inner.bounds, to: window).maxY, window.bounds.height - homeIndicator + 0.5,
            "the content inside clears the home indicator"
        )
    }

    func testAPresentationOtherThanSheetModalOrFullScreenIsRejected() throws {
        try renderer.createView(id: 2, kind: "Sheet", parent: screen, label: "sheet")

        XCTAssertThrowsError(try renderer.setProperty(id: 2, name: "presentation", value: .enumValue(3, "popover")))
    }

    private func openSheet(_ id: UInt32) throws {
        try renderer.createView(id: id, kind: "Sheet", parent: screen, label: "sheet-\(id)")
        try renderer.setProperty(id: id, name: "open", value: .bool(true))
    }

    private func presented() -> UIViewController? {
        window.rootViewController?.presentedViewController
    }

    private func waitUntil(_ what: String, timeout: TimeInterval = 5, _ condition: () -> Bool, line: UInt = #line) {
        let deadline = Date().addingTimeInterval(timeout)

        while !condition(), Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.01))
        }

        XCTAssertTrue(condition(), "timed out waiting until \(what)", line: line)
    }
}

/// A root controller as the app's SystemBars leave it: light, hidden.
private final class LightStatusBarController: UIViewController {
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersStatusBarHidden: Bool { true }
}
