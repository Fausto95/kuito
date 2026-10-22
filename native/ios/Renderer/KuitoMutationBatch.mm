#import "KuitoMutationBatch+Mutations.h"

@implementation KuitoMutationBatch {
  std::vector<kuito::Mutation> _mutations;
  std::vector<KuitoMutationRecord> _records;
  /// Every record's key edits, end to end; reserved whole so records can point into it.
  std::vector<KuitoKeyEditRecord> _edits;
  /// Every Struct record's strings, end to end, reserved the same way.
  std::vector<KuitoTextRecord> _strings;
}

- (instancetype)initWithMutations:(std::vector<kuito::Mutation>)mutations
                           sentAt:(CFTimeInterval)sentAt
                        hostCalls:(NSInteger)hostCalls
                      marksLayout:(BOOL)marksLayout {
  self = [super init];
  if (!self) return nil;
  _mutations = std::move(mutations);
  _sentAt = sentAt;
  _hostCalls = hostCalls;
  _marksLayout = marksLayout;
  _records.reserve(_mutations.size());
  std::size_t editCount = 0;
  std::size_t stringCount = 0;
  for (const auto& m : _mutations) {
    editCount += m.edits.size();
    stringCount += m.record.strings.size();
  }
  _edits.reserve(editCount);
  _strings.reserve(stringCount);
  for (const auto& m : _mutations) {
    const KuitoKeyEditRecord *edits = _edits.data() + _edits.size();
    for (const auto& edit : m.edits) {
      _edits.push_back({
          .op = static_cast<uint8_t>(edit.op),
          .index = edit.index,
          .key = edit.key.data(),
          .keyLength = edit.key.size(),
      });
    }
    const KuitoTextRecord *strings = _strings.data() + _strings.size();
    for (const auto& text : m.record.strings) _strings.push_back({.text = text.data(), .length = text.size()});
    _records.push_back({
        .op = static_cast<uint8_t>(m.op),
        .kind = static_cast<uint8_t>(m.kind),
        .key = static_cast<uint16_t>(m.key),
        .id = m.id,
        .parent = m.parent,
        .index = m.index,
        .number = m.number,
        .color = m.color,
        .enumValue = m.enumValue,
        .flattened = m.flattened,
        .text = m.text.data(),
        .textLength = m.text.size(),
        .name = m.name.data(),
        .nameLength = m.name.size(),
        .edits = m.edits.empty() ? nullptr : edits,
        .editCount = m.edits.size(),
        .numbers = m.record.numbers.empty() ? nullptr : m.record.numbers.data(),
        .numberCount = m.record.numbers.size(),
        .strings = m.record.strings.empty() ? nullptr : strings,
        .stringCount = m.record.strings.size(),
    });
  }
  return self;
}

- (const KuitoMutationRecord *)records { return _records.data(); }
- (NSInteger)count { return static_cast<NSInteger>(_records.size()); }
@end
