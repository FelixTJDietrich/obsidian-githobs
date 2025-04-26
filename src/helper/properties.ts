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
const GITHUB_ISSUE_TITLE_PROPERTY_CODE = 'github_issue_title';
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

/**
 * Write all GitHub properties at once, ensuring none are lost
 * @param data The file content
 * @param properties Object containing github_issue and github_repo values
 * @returns Updated file content with properties
 */
export function writeAllGithubProperties(
	data: string,
	properties: { issueId?: string; repo?: string; issueTitle?: string }
): string {
	const { properties: existingProps } = readProperties(data);
	
	// Start with the properties delimiter
	const result = [PROPERTIES_DELIMITER];
	
	// Add all existing properties except github_* ones that we'll replace
	if (existingProps) {
		const otherProps = existingProps.filter(
			p => !p.startsWith(GITHUB_ISSUE_PROPERTY_CODE) && 
				!p.startsWith(GITHUB_REPO_PROPERTY_CODE) && 
				!p.startsWith(GITHUB_ISSUE_TITLE_PROPERTY_CODE)
		);
		result.push(...otherProps);
	}
	
	// Always include all GitHub properties to ensure they're not lost
	if (properties.issueId !== undefined) {
		result.push(`${GITHUB_ISSUE_PROPERTY_CODE}: ${properties.issueId}`);
	} else {
		// Try to preserve existing issue ID if available
		const existingIssueId = readIssueId(data);
		if (existingIssueId) {
			result.push(`${GITHUB_ISSUE_PROPERTY_CODE}: ${existingIssueId}`);
		}
	}
	
	if (properties.repo !== undefined) {
		result.push(`${GITHUB_REPO_PROPERTY_CODE}: ${properties.repo}`);
	} else {
		// Try to preserve existing repo if available
		const existingRepo = readRepo(data);
		if (existingRepo) {
			result.push(`${GITHUB_REPO_PROPERTY_CODE}: ${existingRepo}`);
		}
	}
	
	// Add the issue title property if provided
	if (properties.issueTitle !== undefined) {
		result.push(`${GITHUB_ISSUE_TITLE_PROPERTY_CODE}: ${properties.issueTitle}`);
	} else {
		// Try to preserve existing issue title if available
		const existingIssueTitle = readIssueTitle(data);
		if (existingIssueTitle) {
			result.push(`${GITHUB_ISSUE_TITLE_PROPERTY_CODE}: ${existingIssueTitle}`);
		}
	}
	
	// Close properties section
	result.push(PROPERTIES_DELIMITER);
	
	return result.join('\n');
}

export function readIssueTitle(data: string) {
	const { properties } = readProperties(data);
	if (!properties) return;

	const githubIssueTitleProperty = properties.find((p) => p.startsWith(GITHUB_ISSUE_TITLE_PROPERTY_CODE));
	if (!githubIssueTitleProperty) return;

	const [, issueTitle] = githubIssueTitleProperty.split(':');
	return issueTitle.trim();
}

export function writeIssueTitle(data: string, issueTitle: string) {
	const { properties } = readProperties(data);

	return [
		PROPERTIES_DELIMITER,
		...(properties
			? [...properties.filter((p) => !p.includes(GITHUB_ISSUE_TITLE_PROPERTY_CODE))]
			: []),
		`${GITHUB_ISSUE_TITLE_PROPERTY_CODE}: ${issueTitle}`,
		PROPERTIES_DELIMITER
	].join('\n');
}
