// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/Vector.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.view.VelocityTracker
import dev.kuito.runtime.renderer.gestures.GestureHandler.Companion.DIRECTION_DOWN
import dev.kuito.runtime.renderer.gestures.GestureHandler.Companion.DIRECTION_LEFT
import dev.kuito.runtime.renderer.gestures.GestureHandler.Companion.DIRECTION_RIGHT
import dev.kuito.runtime.renderer.gestures.GestureHandler.Companion.DIRECTION_UP
import kotlin.math.hypot

internal class Vector(val x: Double, val y: Double) {
    private val unitX: Double
    private val unitY: Double
    val magnitude = hypot(x, y)

    init {
        val isMagnitudeSufficient = magnitude > MINIMAL_RECOGNIZABLE_MAGNITUDE

        unitX = if (isMagnitudeSufficient) x / magnitude else 0.0
        unitY = if (isMagnitudeSufficient) y / magnitude else 0.0
    }

    private fun computeSimilarity(vector: Vector): Double = unitX * vector.unitX + unitY * vector.unitY

    fun isSimilar(vector: Vector, threshold: Double): Boolean = computeSimilarity(vector) > threshold

    companion object {
        private val VECTOR_LEFT: Vector = Vector(-1.0, 0.0)
        private val VECTOR_RIGHT: Vector = Vector(1.0, 0.0)
        private val VECTOR_UP: Vector = Vector(0.0, -1.0)
        private val VECTOR_DOWN: Vector = Vector(0.0, 1.0)

        private val VECTOR_RIGHT_UP: Vector = Vector(1.0, -1.0)
        private val VECTOR_RIGHT_DOWN: Vector = Vector(1.0, 1.0)
        private val VECTOR_LEFT_UP: Vector = Vector(-1.0, -1.0)
        private val VECTOR_LEFT_DOWN: Vector = Vector(-1.0, 1.0)

        private val VECTOR_ZERO: Vector = Vector(0.0, 0.0)
        private const val MINIMAL_RECOGNIZABLE_MAGNITUDE = 0.1

        fun fromDirection(direction: Int): Vector = when (direction) {
            DIRECTION_LEFT -> VECTOR_LEFT
            DIRECTION_RIGHT -> VECTOR_RIGHT
            DIRECTION_UP -> VECTOR_UP
            DIRECTION_DOWN -> VECTOR_DOWN
            DiagonalDirections.DIRECTION_RIGHT_UP -> VECTOR_RIGHT_UP
            DiagonalDirections.DIRECTION_RIGHT_DOWN -> VECTOR_RIGHT_DOWN
            DiagonalDirections.DIRECTION_LEFT_UP -> VECTOR_LEFT_UP
            DiagonalDirections.DIRECTION_LEFT_DOWN -> VECTOR_LEFT_DOWN
            else -> VECTOR_ZERO
        }

        fun fromVelocity(tracker: VelocityTracker): Vector {
            tracker.computeCurrentVelocity(1000)

            val velocityX = tracker.xVelocity.toDouble()
            val velocityY = tracker.yVelocity.toDouble()

            return Vector(velocityX, velocityY)
        }
    }
}
