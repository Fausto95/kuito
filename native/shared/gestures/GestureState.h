#pragma once

namespace kuito::gestures {

/// A gesture's state as `gesture` events report it; the numbers are RNGH's.
enum class State : int { Undetermined = 0, Failed = 1, Began = 2, Cancelled = 3, Active = 4, End = 5 };

inline bool finished(State state) { return state == State::Cancelled || state == State::Failed || state == State::End; }

} // namespace kuito::gestures
