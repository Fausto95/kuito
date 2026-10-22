package dev.kuito.runtime

/** JavaScript that threw while a script was evaluated, with the engine's stack. Thrown from JNI. */
class KuitoScriptError(message: String, val stack: String) : RuntimeException(message)
