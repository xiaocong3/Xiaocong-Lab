/** Workbench navigation and display preferences; project content stays in real files. */
import { xiaocongZh } from './xiaocong-locales.ts'
/** View invalidation event. */
export const XIAOCONG_CHANGE_EVENT = 'aipm-xiaocong-change'
/** Project opening delegated to the workspace owner. */
export const XIAOCONG_OPEN_PROJECT_EVENT = 'aipm-open-project'
/** Workspace adoption failure. */
export const XIAOCONG_WORKSPACE_ERROR_EVENT = 'aipm-workspace-error'
/** Available workbench pages. */
export type XiaocongPage = 'home' | 'project' | 'documents' | 'templates' | 'trash' | 'settings'
/** Persisted navigation. */
export interface XiaocongView { project: string | null; file: string | null; page?: XiaocongPage; tab?: 'overview' | 'chat' | 'document' }
/** Display preferences independent of document content. */
export interface XiaocongPreferences { remember: boolean; autoOpen: boolean; reduced: boolean; sendMode: 'enter' | 'modEnter' }
const STORAGE_KEY = 'aipm.xiaocong.v1'
const PREF_KEY = 'aipm.xiaocong.preferences.v1'
/**
 * Create first-use navigation.
 * @returns first-use navigation.
 */
export function emptyXiaocongView(): XiaocongView { return { project: null, file: null, page: 'home', tab: 'chat' } }
/**
 * Read locally stored display and input preferences.
 * @returns preferences with defaults for a fresh profile.
 */
export function loadXiaocongPreferences(): XiaocongPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}')
    const data = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
    return { remember: data.remember !== false, autoOpen: data.autoOpen !== false, reduced: data.reduced === true, sendMode: data.sendMode === 'modEnter' ? 'modEnter' : 'enter' }
  } catch (error: unknown) { void error; return { remember: true, autoOpen: true, reduced: false, sendMode: 'enter' } }
}
/**
 * Persist and broadcast the selected preferences.
 * @param next - selected preferences.
 */
export function saveXiaocongPreferences(next: XiaocongPreferences): void {
  localStorage.setItem(PREF_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('aipm-preferences-change', { detail: next }))
}
/**
 * Restore valid navigation, including the earlier project-only format.
 * @returns last valid navigation, including the earlier project/file-only format.
 */
export function loadXiaocongView(): XiaocongView {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) return emptyXiaocongView()
    const data = parsed as Record<string, unknown>
    const project = typeof data.project === 'string' && data.project ? data.project : null
    const file = project !== null && typeof data.file === 'string' ? data.file : null
    const page = ['home', 'project', 'documents', 'templates', 'trash', 'settings'].find(item => item === data.page)
    return { project, file, page: page as XiaocongPage | undefined ?? (project === null ? 'home' : 'project'), tab: data.tab === 'overview' || data.tab === 'document' ? data.tab : 'chat' }
  } catch (error: unknown) { void error; return emptyXiaocongView() }
}
/**
 * Persist and broadcast the current navigation.
 * @param next - navigation to remember and broadcast.
 */
export function saveXiaocongView(next: XiaocongView): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(XIAOCONG_CHANGE_EVENT))
}
/**
 * Select the approved greeting from the local clock.
 * @param now - local clock.
 * @returns the two approved Chinese greeting variants.
 */
export function xiaocongGreeting(now = new Date()): string { return now.getHours() < 12 ? xiaocongZh.morning : xiaocongZh.afternoon }
