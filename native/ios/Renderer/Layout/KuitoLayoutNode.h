#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, KuitoMeasureMode) {
    KuitoMeasureModeExactly,
    KuitoMeasureModeAtMost,
    /// The side is unconstrained (max-content); its value is infinite.
    KuitoMeasureModeUndefined,
    /// As narrow as the content allows: text breaks at every word.
    KuitoMeasureModeMinContent,
};

/// How a layout prop's value arrives: native/shared/layout/KuitoLayoutStyle.h's LayoutValue::Kind.
typedef NS_ENUM(uint8_t, KuitoLayoutValueKind) {
    /// Restores the kind's default.
    KuitoLayoutValueKindNull,
    /// A number; a boolean as 0 or 1.
    KuitoLayoutValueKindNumber,
    /// A length's text: "50%", "auto", "fit-content(120)".
    KuitoLayoutValueKindText,
    /// The index of an enum's value among the prop's manifest values.
    KuitoLayoutValueKindEnum,
};

/// A layout prop's value as the host batch typed it. `text` is read in place
/// for the call, not copied, and needs no terminator.
typedef struct {
    KuitoLayoutValueKind kind;
    double number;
    int32_t index;
    const char *_Nullable text;
    size_t textLength;
} KuitoLayoutValue;

/// Returns a leaf's content size (without padding) for the given space.
typedef CGSize (^KuitoMeasureBlock)(CGFloat width, KuitoMeasureMode widthMode, CGFloat height,
                                     KuitoMeasureMode heightMode);

/// A view's node in the shared flexbox engine (native/shared/layout). A node
/// leaves its parent when it is deallocated.
/// The engine's work since launch (layout::LayoutCost), for KuitoCost: zero
/// in a build without KUITO_INSTRUMENTS.
typedef struct {
    uint64_t nodesLaidOut;
    uint64_t measureCalls;
    uint64_t wastedMeasures;
} KuitoLayoutCost;

@interface KuitoLayoutNode : NSObject
/// Starts with the kind's default layout; throws for a kind with none.
- (nullable instancetype)initWithKind:(NSString *)kind error:(NSError **)error NS_SWIFT_NAME(init(kind:));
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;

/// Whether the platform sizes this kind through `measure`.
@property (nonatomic, readonly) BOOL measured;
@property (nonatomic, copy, nullable) KuitoMeasureBlock measure;
/// The view this node positions; nil for a flattened (layout-only) node.
@property (nonatomic, weak, nullable) UIView *view;
/// How the view moves to a new frame (the `layout` prop); nil applies it at once.
@property (nonatomic, strong, nullable) id frameAnimation;

@property (nonatomic, readonly, nullable) KuitoLayoutNode *parent;
@property (nonatomic, readonly) NSArray<KuitoLayoutNode *> *children;
/// Relative to the parent's frame; a scroll view's children are relative to its content.
@property (nonatomic, readonly) CGRect frame;
/// The scrollable size of a scroll view; the frame's size otherwise.
@property (nonatomic, readonly) CGSize contentSize;
/// The padding and border a measured leaf draws its content inside.
@property (nonatomic, readonly) UIEdgeInsets contentInset;
/// Padding the platform adds on top of the view's own, e.g. a safe-area inset.
@property (nonatomic) UIEdgeInsets inset;

- (void)insertChild:(KuitoLayoutNode *)child atIndex:(NSInteger)index;
- (void)removeFromParent;
/// A node laid out on its own (a page, a sheet) inherits `direction` from
/// `host`, the node of the view that shows it; nil inherits nothing.
- (void)inheritFrom:(nullable KuitoLayoutNode *)host NS_SWIFT_NAME(inherit(from:));
/// Sets the node's own `direction`, as the prop does: the root's follows the app's first language.
- (BOOL)setDirectionRightToLeft:(BOOL)rightToLeft error:(NSError **)error NS_SWIFT_NAME(setDirection(rightToLeft:));
/// Whether the node lays out right to left: its own `direction`, else the one it inherits.
@property (nonatomic, readonly) BOOL rightToLeft;
/// Whether the engine applies the prop at `key` (PropKeys.generated.h).
+ (BOOL)isLayoutProperty:(uint16_t)key;

@property (class, nonatomic, readonly) KuitoLayoutCost cost;
/// Sets the prop at `key`; a null value restores the kind's default.
- (BOOL)setProperty:(uint16_t)key value:(KuitoLayoutValue)value error:(NSError **)error
    NS_SWIFT_NAME(setProperty(_:value:));
/// Sets a prop without marking the node dirty, for a prop that moves every
/// frame: call `relayout` next.
- (BOOL)changeProperty:(uint16_t)key value:(KuitoLayoutValue)value error:(NSError **)error
    NS_SWIFT_NAME(changeProperty(_:value:));
/// After `changeProperty`: lays out again, at once, only the subtree of the
/// nearest ancestor whose own frame the change cannot move, and returns that
/// ancestor. Nil when the change can reach the root, which is left dirty for
/// the next calculation.
- (nullable KuitoLayoutNode *)relayout;
/// What `measure` returns changed (text, font, a control's title): measure
/// again in the next calculation. Properties and tree edits mark themselves.
- (void)markDirty;
/// A change to what `measure` returns. The climb stops at the first fixed-size
/// ancestor (native/shared/layout/FlexLayout.h, markContentDirty).
- (void)markContentDirty;
/// Whether the next calculation lays this node out again.
@property (nonatomic, readonly) BOOL dirty;
/// A NaN side is unconstrained: the node wraps its content along it.
- (void)calculateWithWidth:(CGFloat)width height:(CGFloat)height scale:(CGFloat)scale;
@end

NS_ASSUME_NONNULL_END
