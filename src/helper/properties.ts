/*
Example of obsidian properties syntax
---
tags: (list | alias | tags type)
	- tag1
	- tag2
number: 3 (number type)
text: "this is text" (text type)

[and more..]
---
*/

const GITHUB_ISSUE_PROPERTY_CODE = 'github_issue';
const GITHUB_REPO_PROPERTY_CODE = 'github_repo';
const PROPERTIES_DELIMITER = '---';

export function readProperties(data: string): {
	properties: string[] | undefined;
	indexEndPropertiesLine: number | undefined;
} {
	const [firstLine, ...restOfLines] = data.split('\n');
	// Check if exist the property start syntax
	if (firstLine !== PROPERTIES_DELIMITER) {
		return { properties: undefined, indexEndPropertiesLine: undefined };
	}

	// Check if exist the property end syntax
	const indexEndPropertiesLine = restOfLines.indexOf(PROPERTIES_DELIMITER);
	if (!indexEndPropertiesLine) {
		return { properties: undefined, indexEndPropertiesLine: undefined };
	}

	return {
		properties: restOfLines.slice(0, indexEndPropertiesLine),
		indexEndPropertiesLine: indexEndPropertiesLine + 1
	};
}

export function removeProperties(data: string) {
	const { indexEndPropertiesLine } = readProperties(data);
	if (!indexEndPropertiesLine) return data;

	const dataSplitted = data.split('\n');
	return dataSplitted.slice(indexEndPropertiesLine + 1).join('\n');
}

export function readIssueId(data: string) {
	const { properties } = readProperties(data);
	if (!properties) return;

	const githubIssueProperty = properties.find((p) => p.startsWith(GITHUB_ISSUE_PROPERTY_CODE));
	if (!githubIssueProperty) return;

	const [, issueId] = githubIssueProperty.split(':');
	return issueId;
}

export function writeIssueId(data: string, issueId: string) {
	const { properties } = readProperties(data);

	return [
		PROPERTIES_DELIMITER,
		...(properties
			? [...properties.filter((p) => !p.includes(GITHUB_ISSUE_PROPERTY_CODE))]
			: []),
		`${GITHUB_ISSUE_PROPERTY_CODE}: ${issueId}`,
		PROPERTIES_DELIMITER
	].join('\n');
}

export function readRepo(data: string) {
	const { properties } = readProperties(data);
	if (!properties) return;

	const githubRepoProperty = properties.find((p) => p.startsWith(GITHUB_REPO_PROPERTY_CODE));
	if (!githubRepoProperty) return;

	const [, repo] = githubRepoProperty.split(':');
	return repo.trim();
}

export function writeRepo(data: string, repo: string) {
	const { properties } = readProperties(data);

	return [
		PROPERTIES_DELIMITER,
		...(properties
			? [...properties.filter((p) => !p.includes(GITHUB_REPO_PROPERTY_CODE))]
			: []),
		`${GITHUB_REPO_PROPERTY_CODE}: ${repo}`,
		PROPERTIES_DELIMITER
	].join('\n');
}

export function parseRepoOverride(repoString: string | undefined): {owner?: string, repo?: string} {
	if (!repoString) return {};
	
	// Handle the format "owner/repo"
	if (repoString.includes('/')) {
		const [owner, repo] = repoString.split('/');
		return { owner: owner.trim(), repo: repo.trim() };
	}
	
	// Handle just the repo name without owner
	return { repo: repoString.trim() };
}

export function getEffectiveRepoSettings(data: string, settings: any): {owner: string, repo: string, token: string} {
	const repoOverride = readRepo(data);
	const { owner: overrideOwner, repo: overrideRepo } = parseRepoOverride(repoOverride);
	
	return {
		owner: overrideOwner || settings.owner,
		repo: overrideRepo || settings.repo,
		token: settings.token,
	};
}
