import UIKit
import XCTest

/// Blur (native/modules/blur): a view whose backdrop is a UIVisualEffectView
/// of a system material, under the children it lays out.
@MainActor
final class KuitoBlurTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    private let id: UInt32 = 1

    override func setUp() async throws {
        KuitoModuleViews.shared.register(
            "module:Blur",
            KuitoModuleView(KuitoBlurView.self, KuitoBlurView.define).kind(events: [])
        )
        renderer = KuitoUIKitRenderer(container: container)
        try renderer.createView(id: id, kind: "module:Blur", parent: 0, label: "blur")
    }

    private var blur: KuitoBlurView {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoBlurView) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    func testEachMaterialIsUIKitsSystemMaterial() throws {
        XCTAssertEqual(try blur.style, .systemMaterial, "regular by default")

        let materials: [(String, UIBlurEffect.Style)] = [
            ("ultraThin", .systemUltraThinMaterial), ("thin", .systemThinMaterial), ("regular", .systemMaterial),
            ("thick", .systemThickMaterial), ("chrome", .systemChromeMaterial),
        ]

        for (material, style) in materials {
            try set("material", .text(material))
            XCTAssertEqual(try blur.style, style, material)
        }

        try set("material", .null)
        XCTAssertEqual(try blur.style, .systemMaterial)
    }

    func testAMaterialItDoesNotHaveIsRejected() {
        XCTAssertThrowsError(try set("material", .text("frosted"))) { error in
            guard case KuitoRenderError.unsupportedValue(let prop, _, _, _) = error else { return XCTFail("\(error)") }

            XCTAssertEqual(prop, "material")
        }
    }

    func testItsChildrenSitAboveTheBlurWhichFillsIt() throws {
        try renderer.setProperty(id: id, name: "padding", value: .number(12))
        try renderer.createView(id: 2, kind: "Text", parent: id, label: "title")
        try renderer.setProperty(id: 2, name: "text", value: .text("Now playing"))
        container.layoutIfNeeded()

        let blur = try blur
        let effect = try XCTUnwrap(blur.subviews.first as? UIVisualEffectView, "the blur is its first subview")
        let title = try XCTUnwrap(renderer.nodes[2]?.view)

        blur.layoutIfNeeded()
        XCTAssertTrue(title.superview === blur)
        XCTAssertGreaterThan(try XCTUnwrap(blur.subviews.firstIndex(of: title)), 0)
        XCTAssertEqual(effect.frame, blur.bounds)
        XCTAssertEqual(title.frame.minX, 12)
    }
}
