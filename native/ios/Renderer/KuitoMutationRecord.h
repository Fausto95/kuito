#import <stdbool.h>
#import <stddef.h>
#import <stdint.h>

/// One edit of a list's keys: Mutation.h's `KeyEdit`. `key` points into the
/// batch as `text` does.
typedef struct {
    /// KeyEdit::Op: Insert 0, Remove, Move.
    uint8_t op;
    int32_t index;
    const char *_Nullable key;
    size_t keyLength;
} KuitoKeyEditRecord;

/// One string of a Struct value's record, pointing into the batch as `text` does.
typedef struct {
    const char *_Nullable text;
    size_t length;
} KuitoTextRecord;

/// One typed mutation of the host batch, as Swift reads it: a C view of
/// native/shared/Mutation.h's `Mutation`, field for field. `text` and `name`
/// point into the batch's own strings (UTF-8, not terminated by their
/// length), valid while the batch lives.
typedef struct {
    /// Mutation.h's `Op`: Create 1, Remove, Move, Flatten, Prop, Command, UI, UIScript, UIKernel, UIBundle.
    uint8_t op;
    /// Mutation.h's `Value`: Null 0, Number, Boolean, Text, Color, Enum, Json, Keys, Struct.
    uint8_t kind;
    /// The prop's key (PropKeys.generated.h), or 0xffff for a prop that goes by `name`.
    uint16_t key;
    uint32_t id;
    uint32_t parent;
    int32_t index;
    double number;
    /// 0xRRGGBBAA.
    uint32_t color;
    int32_t enumValue;
    bool flattened;
    const char *_Nullable text;
    size_t textLength;
    const char *_Nullable name;
    size_t nameLength;
    /// A Keys value's edits, in order.
    const KuitoKeyEditRecord *_Nullable edits;
    size_t editCount;
    /// A Struct value's record (Mutation.h's `StructRecord`): its numbers and
    /// strings in its schema's order.
    const double *_Nullable numbers;
    size_t numberCount;
    const KuitoTextRecord *_Nullable strings;
    size_t stringCount;
} KuitoMutationRecord;
