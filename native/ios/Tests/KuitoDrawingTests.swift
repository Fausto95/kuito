import UIKit
import XCTest

/// Drawing (native/modules/drawing): a layer per shape, each a CAShapeLayer
/// whose path is its `d` as the shared parser reads it (native/shared/PathData.h),
/// inside a layer that fits the viewBox to the view.
@MainActor
final class KuitoDrawingTests: XCTestCase {
    private let container = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
    private var renderer: KuitoUIKitRenderer!
    private let id: UInt32 = 1

    override func setUp() async throws {
        KuitoModuleViews.shared.register(
            "module:Drawing",
            KuitoModuleView(KuitoDrawingView.self, KuitoDrawingView.define).kind(events: [])
        )
        renderer = KuitoUIKitRenderer(container: container)
        try renderer.createView(id: id, kind: "module:Drawing", parent: 0, label: "drawing")
        try set("width", .number(200))
        try set("height", .number(200))
    }

    private var drawing: KuitoDrawingView {
        get throws { try XCTUnwrap(renderer.nodes[id]?.view as? KuitoDrawingView) }
    }

    private func set(_ name: String, _ value: KuitoValue) throws {
        try renderer.setProperty(id: id, name: name, value: value)
    }

    private func layers() throws -> [CAShapeLayer] {
        try drawing.canvas.sublayers?.compactMap { $0 as? CAShapeLayer } ?? []
    }

    private func shape(_ fields: String) -> String {
        ##"{"fill":"#ff0000ff","fillRule":"nonzero","stroke":null,"strokeWidth":1,"strokeLinecap":"butt","strokeLinejoin":"miter","strokeMiterlimit":4,"strokeDasharray":[],"strokeDashoffset":0,"opacity":1,"transform":[1,0,0,1,0,0],"## + fields + "}"
    }

    func testEachShapeIsALayerWithItsPath() throws {
        try set("shapes", .json("[" + shape(#""d":"M0 0H50V50H0Z""#) + "," + shape(#""d":"M60 60L70 70""#) + "]"))

        let layers = try layers()

        XCTAssertEqual(layers.count, 2)
        XCTAssertEqual(layers[0].path?.boundingBox, CGRect(x: 0, y: 0, width: 50, height: 50))
        XCTAssertEqual(layers[0].fillColor, UIColor(red: 1, green: 0, blue: 0, alpha: 1).cgColor)
        XCTAssertNil(layers[0].strokeColor, "no stroke")

        try set("shapes", .json("[" + shape(#""d":"M0 0H10V10Z""#) + "]"))
        XCTAssertEqual(try self.layers().count, 1, "new shapes replace the old")
    }

    func testPaintIsTheLayersStroke() throws {
        try set("shapes", .json("[" + ##"{"d":"M0 0L10 10","fill":null,"fillRule":"evenodd","stroke":"#0000ff80","strokeWidth":3,"strokeLinecap":"round","strokeLinejoin":"bevel","strokeMiterlimit":8,"strokeDasharray":[2,1],"strokeDashoffset":1,"opacity":0.5,"transform":[2,0,0,2,5,6]}"## + "]"))

        let layer = try XCTUnwrap(try layers().first)

        XCTAssertNil(layer.fillColor)
        XCTAssertEqual(layer.fillRule, .evenOdd)
        XCTAssertEqual(layer.strokeColor, UIColor(red: 0, green: 0, blue: 1, alpha: 128.0 / 255).cgColor)
        XCTAssertEqual(layer.lineWidth, 3)
        XCTAssertEqual(layer.lineCap, .round)
        XCTAssertEqual(layer.lineJoin, .bevel)
        XCTAssertEqual(layer.miterLimit, 8)
        XCTAssertEqual(layer.lineDashPattern, [2, 1])
        XCTAssertEqual(layer.lineDashPhase, 1)
        XCTAssertEqual(layer.opacity, 0.5)
        XCTAssertEqual(layer.affineTransform(), CGAffineTransform(a: 2, b: 0, c: 0, d: 2, tx: 5, ty: 6))
    }

    func testTheViewBoxFitsTheViewKeepingItsAspect() throws {
        container.layoutIfNeeded()
        XCTAssertEqual(try drawing.canvas.affineTransform(), .identity, "user units are points without one")

        try set("viewBox", .json("[0,0,100,100]"))
        container.layoutIfNeeded()
        try drawing.layoutIfNeeded()
        XCTAssertEqual(try drawing.canvas.affineTransform(), CGAffineTransform(a: 2, b: 0, c: 0, d: 2, tx: 0, ty: 0))

        try set("height", .number(100))
        try set("viewBox", .json("[10,0,100,100]"))
        container.layoutIfNeeded()
        try drawing.layoutIfNeeded()
        XCTAssertEqual(
            try drawing.canvas.affineTransform(), CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 40, ty: 0),
            "centered across, its origin at the view's"
        )
    }

    func testMalformedPathDataIsRejectedWithTheParsersError() {
        XCTAssertThrowsError(try set("shapes", .json("[" + shape(#""d":"L1 2""#) + "]"))) { error in
            guard case KuitoRenderError.unsupportedValue(let prop, _, _, let detail) = error else { return XCTFail("\(error)") }

            XCTAssertEqual(prop, "shapes")
            XCTAssertTrue("\(detail)".contains("KUITO_PATH: path data starts with a moveto"), "\(detail)")
        }
    }

    func testAViewBoxIsFourNumbersWithASize() {
        for value in ["[0,0,100]", "[0,0,0,100]", #""0 0 100 100""#] {
            XCTAssertThrowsError(try set("viewBox", .json(value)), value)
        }
    }
}
