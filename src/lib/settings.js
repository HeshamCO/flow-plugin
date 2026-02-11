/**
 * Flow Plugin – Settings management
 * Uses Sketch's persistent Settings API to store server URL, auth token, etc.
 *
 * @typedef {import('../types/index').PluginSettings} PluginSettings
 */
import Settings from 'sketch/settings';

const KEYS = {
	SERVER_URL: 'Flow.serverUrl',
	AUTH_TOKEN: 'Flow.authToken',
	USER_EMAIL: 'Flow.userEmail',
	USER_NAME: 'Flow.userName',
	LAST_PROJECT_ID: 'Flow.lastProjectId',
	LAST_PUBLISH_TIME: 'Flow.lastPublishTime',
};

// ─── Server URL ──────────────────────────────────────────────────────

/** @returns {string} */
export function getServerUrl() {
	return Settings.settingForKey(KEYS.SERVER_URL) || '';
}

/** @param {string} url */
export function setServerUrl(url) {
	const cleaned = (url || '').replace(/\/+$/, '');
	Settings.setSettingForKey(KEYS.SERVER_URL, cleaned);
}

// ─── Auth Token ──────────────────────────────────────────────────────

/** @returns {string} */
export function getAuthToken() {
	return Settings.settingForKey(KEYS.AUTH_TOKEN) || '';
}

/** @param {string} token */
export function setAuthToken(token) {
	Settings.setSettingForKey(KEYS.AUTH_TOKEN, token);
}

// ─── User Info ───────────────────────────────────────────────────────

/** @returns {string} */
export function getUserEmail() {
	return Settings.settingForKey(KEYS.USER_EMAIL) || '';
}

/** @returns {string} */
export function getUserName() {
	return Settings.settingForKey(KEYS.USER_NAME) || '';
}

/**
 * @param {string} email
 * @param {string} [name]
 */
export function setUserInfo(email, name) {
	Settings.setSettingForKey(KEYS.USER_EMAIL, email);
	Settings.setSettingForKey(KEYS.USER_NAME, name || '');
}

// ─── Last Project ────────────────────────────────────────────────────

/** @returns {string} */
export function getLastProjectId() {
	return Settings.settingForKey(KEYS.LAST_PROJECT_ID) || '';
}

/** @param {string} id */
export function setLastProjectId(id) {
	Settings.setSettingForKey(KEYS.LAST_PROJECT_ID, id);
}

// ─── Publish Tracking ────────────────────────────────────────────────

/** @returns {string} ISO timestamp of the last publish, or '' */
export function getLastPublishTime() {
	return Settings.settingForKey(KEYS.LAST_PUBLISH_TIME) || '';
}

export function setLastPublishTime() {
	Settings.setSettingForKey(KEYS.LAST_PUBLISH_TIME, new Date().toISOString());
}

// ─── Convenience ─────────────────────────────────────────────────────

/** @returns {PluginSettings} */
export function getAllSettings() {
	return {
		serverUrl: getServerUrl(),
		authToken: getAuthToken(),
		userEmail: getUserEmail(),
		userName: getUserName(),
		lastProjectId: getLastProjectId(),
	};
}

export function clearAuth() {
	Settings.setSettingForKey(KEYS.AUTH_TOKEN, '');
	Settings.setSettingForKey(KEYS.USER_EMAIL, '');
	Settings.setSettingForKey(KEYS.USER_NAME, '');
	Settings.setSettingForKey(KEYS.LAST_PROJECT_ID, '');
}

/** @returns {boolean} */
export function isConfigured() {
	return !!getServerUrl();
}

/** @returns {boolean} */
export function isAuthenticated() {
	return !!getServerUrl() && !!getAuthToken();
}
