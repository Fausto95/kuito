#import "KuitoLayoutNode.h"
#include "LayoutReceipts.h"
#include "layout/KuitoLayoutStyle.h"
#include <memory>
#include <stdexcept>

// Qualified: MacTypes.h declares its own Size.
namespace layout = kuito::layout;

static NSError *KuitoLayoutError(const std::exception &error) {
    return [NSError errorWithDomain:@"dev.kuito.layout"
                               code:1
                           userInfo:@{NSLocalizedDescriptionKey: @(error.what())}];
}

static_assert(static_cast<int>(layout::LayoutValue::Kind::Null) == KuitoLayoutValueKindNull &&
                  static_cast<int>(layout::LayoutValue::Kind::Number) == KuitoLayoutValueKindNumber &&
                  static_cast<int>(layout::LayoutValue::Kind::Text) == KuitoLayoutValueKindText &&
                  static_cast<int>(layout::LayoutValue::Kind::Enum) == KuitoLayoutValueKindEnum,
              "KuitoLayoutValueKind numbers LayoutValue::Kind");

static layout::LayoutValue KuitoEngineValue(KuitoLayoutValue value) {
    return {static_cast<layout::LayoutValue::Kind>(value.kind), value.number, value.index,
            value.text ? std::string_view(value.text, value.textLength) : std::string_view()};
}

static KuitoMeasureMode KuitoMode(layout::MeasureMode mode) {
    switch (mode) {
        case layout::MeasureMode::Exactly: return KuitoMeasureModeExactly;
        case layout::MeasureMode::AtMost: return KuitoMeasureModeAtMost;
        case layout::MeasureMode::Undefined: return KuitoMeasureModeUndefined;
        case layout::MeasureMode::MinContent: return KuitoMeasureModeMinContent;
    }
}

@implementation KuitoLayoutNode {
    std::unique_ptr<layout::Node> _node;
    const layout::KindLayout *_kind;
}

- (nullable instancetype)initWithKind:(NSString *)kind error:(NSError **)error {
    if (!(self = [super init])) return nil;
    try {
        _kind = &layout::kindLayout(kind.UTF8String);
    } catch (const std::exception &failure) {
        if (error) *error = KuitoLayoutError(failure);
        return nil;
    }
    _node = std::make_unique<layout::Node>();
    _node->style = _kind->style;
    // Unretained: a node leaves the tree before its wrapper is deallocated.
    _node->context = (__bridge void *)self;
    return self;
}

- (BOOL)measured {
    return _kind->measured;
}

- (void)setMeasure:(KuitoMeasureBlock)measure {
    _measure = [measure copy];
    if (!_measure) {
        _node->measure = nullptr;
        return;
    }
    __weak KuitoLayoutNode *weakSelf = self;
    _node->measure = [weakSelf, last = std::optional<layout::Size>()](float width, layout::MeasureMode widthMode, float height,
                                                                      layout::MeasureMode heightMode) mutable {
        KuitoMeasureBlock block = weakSelf.measure;
        if (!block) return layout::Size{};
        return kuito::measureLeaf(last, [&] {
            CGSize size = block(width, KuitoMode(widthMode), height, KuitoMode(heightMode));
            return layout::Size{static_cast<float>(size.width), static_cast<float>(size.height)};
        });
    };
}

- (nullable KuitoLayoutNode *)parent {
    layout::Node *parent = _node->parent();
    return parent ? (__bridge KuitoLayoutNode *)parent->context : nil;
}

- (NSArray<KuitoLayoutNode *> *)children {
    NSMutableArray *children = [NSMutableArray arrayWithCapacity:_node->children().size()];
    for (layout::Node *child : _node->children()) [children addObject:(__bridge KuitoLayoutNode *)child->context];
    return children;
}

- (CGRect)frame {
    const layout::Layout &box = _node->layout();
    return CGRectMake(box.x, box.y, box.width, box.height);
}

- (CGSize)contentSize {
    const layout::Layout &box = _node->layout();
    return CGSizeMake(box.content.width, box.content.height);
}

- (UIEdgeInsets)contentInset {
    const layout::Edges &inset = _node->contentInset();
    return UIEdgeInsetsMake(inset.top, inset.left, inset.bottom, inset.right);
}

- (UIEdgeInsets)inset {
    const layout::Edges &inset = _node->style.extraPadding;
    return UIEdgeInsetsMake(inset.top, inset.left, inset.bottom, inset.right);
}

- (void)setInset:(UIEdgeInsets)inset {
    const layout::Edges edges{static_cast<float>(inset.top), static_cast<float>(inset.right),
                              static_cast<float>(inset.bottom), static_cast<float>(inset.left)};
    if (_node->style.extraPadding == edges) return;
    _node->style.extraPadding = edges;
    _node->markDirty();
}

- (void)markDirty {
    _node->markDirty();
}

- (void)markContentDirty {
    _node->markContentDirty();
}

- (BOOL)dirty {
    return _node->dirty();
}

- (void)insertChild:(KuitoLayoutNode *)child atIndex:(NSInteger)index {
    _node->insert(*child->_node, static_cast<std::size_t>(MAX(index, 0)));
}

- (void)removeFromParent {
    if (layout::Node *parent = _node->parent()) parent->remove(*_node);
}

- (void)inheritFrom:(nullable KuitoLayoutNode *)host {
    _node->inheritFrom(host ? host->_node.get() : nullptr);
}

- (BOOL)setDirectionRightToLeft:(BOOL)rightToLeft error:(NSError **)error {
    static constexpr auto ltr = kuito::enumValue(kuito::PropKey::Direction, "ltr");
    static constexpr auto rtl = kuito::enumValue(kuito::PropKey::Direction, "rtl");
    static_assert(ltr && rtl, "direction takes ltr and rtl");
    try {
        layout::setLayoutProperty(_node->style, _kind->style, kuito::PropKey::Direction,
                                  layout::LayoutValue::choice(rightToLeft ? *rtl : *ltr));
    } catch (const std::exception &failure) {
        if (error) *error = KuitoLayoutError(failure);
        return NO;
    }
    _node->markDirty();
    return YES;
}

- (BOOL)rightToLeft {
    return _node->style.direction == layout::Direction::Rtl;
}

+ (BOOL)isLayoutProperty:(uint16_t)key {
    return layout::isLayoutProperty(static_cast<kuito::PropKey>(key));
}

- (BOOL)setProperty:(uint16_t)key value:(KuitoLayoutValue)value error:(NSError **)error {
    if (![self changeProperty:key value:value error:error]) return NO;
    _node->markDirty();
    return YES;
}

- (BOOL)changeProperty:(uint16_t)key value:(KuitoLayoutValue)value error:(NSError **)error {
    try {
        layout::setLayoutProperty(_node->style, _kind->style, static_cast<kuito::PropKey>(key), KuitoEngineValue(value));
        return YES;
    } catch (const std::exception &failure) {
        if (error) *error = KuitoLayoutError(failure);
        return NO;
    }
}

- (nullable KuitoLayoutNode *)relayout {
    layout::Node *changed = _node->relayout();
    return changed ? (__bridge KuitoLayoutNode *)changed->context : nil;
}

+ (KuitoLayoutCost)cost {
    const layout::LayoutCost &cost = layout::layoutCost();
    return {cost.nodesLaidOut, cost.measureCalls, cost.wastedMeasures};
}

- (void)calculateWithWidth:(CGFloat)width height:(CGFloat)height scale:(CGFloat)scale {
    const auto side = [](CGFloat value) -> std::optional<float> {
        return isnan(value) ? std::nullopt : std::optional<float>(static_cast<float>(value));
    };
    kuito::calculateRoot(*_node, [&] { _node->calculate(side(width), side(height), static_cast<float>(scale)); });
}

@end
