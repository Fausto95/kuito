package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.accessibility.KuitoAccessibility
import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoValue

/**
 * What TalkBack reads and does: labels, roles, state, value, actions,
 * visibility to screen readers and live regions. Each prop updates the
 * view's KuitoAccessibility, which recomposes the view.
 */
internal object KuitoAccessibilityProperties {
    /** A flag, a number or text, kept as the scalar KuitoAccessibility reads. */
    private val fact = accessibility { context, state, value -> state.facts[context.name] = value.untyped }

    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "accessible" to accessibility { context, state, value ->
            state.accessible = if (value == KuitoValue.Null) null else context.flag(value)
        },
        "label" to accessibility { context, state, value ->
            state.label = if (value == KuitoValue.Null) null else context.text(value)
        },
        "hint" to accessibility { context, state, value ->
            state.hint = if (value == KuitoValue.Null) null else context.text(value)
        },
        // The kernel sends ARIA's role as the role it means here (src/runtime/accessibility-props.ts).
        "role" to accessibility { context, state, value ->
            val role = if (value == KuitoValue.Null) null else context.keyword(value)

            if (role != null && role !in KuitoAccessibility.ROLE_CLASSES) context.unsupportedValue(value, "expects one of its values")

            state.role = role
        },
        "aria-hidden" to accessibility { context, state, value -> state.elementsHidden = context.flag(value) },
        "actions" to accessibility { context, state, value ->
            state.actions = KuitoPropValues.actions(context.record(value)).map { action ->
                if (action.name.isEmpty()) context.unsupportedValue(value, "expects every action to have a name")

                action.name to action.label?.takeIf { it.isNotEmpty() }
            }
        },
        "live" to accessibility { context, state, value ->
            val live = context.keyword(value)

            if (live !in KuitoAccessibility.LIVE_REGIONS) context.unsupportedValue(value, "expects one of its values")

            state.liveRegion = live
        },
        // ARIA's state and value facts.
        "aria-disabled" to fact,
        "aria-selected" to fact,
        "aria-checked" to fact,
        "aria-busy" to fact,
        "aria-expanded" to fact,
        "aria-valuemin" to fact,
        "aria-valuemax" to fact,
        "aria-valuenow" to fact,
        "aria-valuetext" to fact,
    )

    private fun accessibility(
        change: (KuitoPropertyContext, KuitoAccessibility, KuitoValue) -> Unit,
    ): KuitoPropertySetter = { context, value ->
        val state = context.style.accessibility

        change(context, state, value)
        state.apply(context.view) { event, payload -> context.events.emit(context.id, event, payload) }
    }
}
