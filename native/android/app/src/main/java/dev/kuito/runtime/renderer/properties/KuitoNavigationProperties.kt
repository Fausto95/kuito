package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoTabIconValue
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.views.KuitoHeaderItem
import dev.kuito.runtime.renderer.views.KuitoHeaderSearch
import dev.kuito.runtime.renderer.views.KuitoNavigationScreenLayout
import dev.kuito.runtime.renderer.views.KuitoNavigationTabLayout
import dev.kuito.runtime.renderer.views.KuitoNavigationTabsLayout
import dev.kuito.runtime.renderer.views.KuitoTitled

/** Native navigation: screen headers, tab items and the tab bar's selection. */
internal object KuitoNavigationProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "title" to on<KuitoTitled> { context, view, value -> view.title = if (value == KuitoValue.Null) "" else context.text(value) },
        "header" to on<KuitoNavigationScreenLayout> { context, screen, value ->
            screen.headerShown = context.flag(value)
        },
        "headerItems" to on<KuitoNavigationScreenLayout> { context, screen, value ->
            screen.actions.items = if (value == KuitoValue.Null) emptyList() else KuitoHeaderItem.list(KuitoPropValues.headerItems(context.record(value)))
        },
        "largeTitle" to on<KuitoNavigationScreenLayout> { context, screen, value ->
            screen.largeTitleShown = context.flag(value)
        },
        "search" to on<KuitoNavigationScreenLayout> { context, screen, value ->
            screen.actions.search = if (value == KuitoValue.Null) null else KuitoHeaderSearch.of(KuitoPropValues.search(context.record(value)))
        },
        // A Material Symbol name, { ios, android } names, or { uri }.
        "icon" to on<KuitoNavigationTabLayout> { context, tab, value ->
            if (value == KuitoValue.Null) return@on tab.setSymbol(null)

            when (val icon = KuitoPropValues.icon(context.record(value))) {
                is KuitoTabIconValue.Symbol -> tab.setSymbol(icon.value)
                is KuitoTabIconValue.Image ->
                    tab.loadIcon(icon.value.uri.takeIf { it.isNotEmpty() } ?: context.unsupportedValue(value, "{ uri } needs a URL"))
                is KuitoTabIconValue.Platforms -> tab.setSymbol(icon.value.android?.takeIf { it.isNotEmpty() })
            }
        },
        // Any view: the stack reads it when it pushes or pops (KuitoSharedTransition).
        "sharedId" to { context, value ->
            context.style.sharedId = if (value == KuitoValue.Null) null else context.text(value)
        },
        "selectedIndex" to on<KuitoNavigationTabsLayout> { context, tabs, value ->
            val index = context.number(value)

            if (index < 0 || index % 1 != 0f) context.unsupportedValue(value, "expects a tab index")

            tabs.selectedIndex = index.toInt()
        },
    )
}
