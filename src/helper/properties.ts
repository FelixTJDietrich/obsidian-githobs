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

	// Extract everything after the property name and first colon
	const propertyPrefix = `${GITHUB_ISSUE_PROPERTY_CODE}:`;
	const issueId = githubIssueProperty.substring(propertyPrefix.length).trim();
	
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

	// Extract everything after the property name and first colon
	const propertyPrefix = `${GITHUB_REPO_PROPERTY_CODE}:`;
	const repo = githubRepoProperty.substring(propertyPrefix.length).trim();
	
	return repo;
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

export function getEffectiveRepoSettings(data: string, settings: {owner: string, repo: string, token: string}): {owner: string, repo: string, token: string} {
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
/**
 * Helper function to escape special characters in YAML strings
 * @param str The string to escape
 * @returns Properly escaped YAML string
 */
function escapeYamlString(str: string): string {
	// Return empty string if input is undefined or null
	if (!str) return '';
	
	// If the string contains any of these characters, wrap it in double quotes
	if (/[:`'"{}[\]|><!?*&$%@#\\]/.test(str) || str.includes('\n')) {
		// Escape double quotes inside the string
		const escapedStr = str.replace(/"/g, '\\"');
		return `"${escapedStr}"`;
	}
	return str;
}

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
		// Add debug logging
		console.log(`Original issue title: "${properties.issueTitle}"`);
		
		// Properly escape title for YAML if it contains special characters
		const escapedTitle = escapeYamlString(properties.issueTitle);
		console.log(`Escaped issue title: ${escapedTitle}`);
		
		result.push(`${GITHUB_ISSUE_TITLE_PROPERTY_CODE}: ${escapedTitle}`);
	} else {
		// Try to preserve existing issue title if available
		const existingIssueTitle = readIssueTitle(data);
		if (existingIssueTitle) {
			// Add debug logging
			console.log(`Existing issue title: "${existingIssueTitle}"`);
			
			// Also escape the existing title when preserving it
			const escapedExistingTitle = escapeYamlString(existingIssueTitle);
			console.log(`Escaped existing title: ${escapedExistingTitle}`);
			
			result.push(`${GITHUB_ISSUE_TITLE_PROPERTY_CODE}: ${escapedExistingTitle}`);
		}
	}
	
	// Close properties section
	result.push(PROPERTIES_DELIMITER);
	
	return result.join('\n');
}

export function readIssueTitle(data: string) {
	const { properties } = readProperties(data);
	if (!properties) {
		console.log('No properties found in the data');
		return;
	}

	const githubIssueTitleProperty = properties.find((p) => p.startsWith(GITHUB_ISSUE_TITLE_PROPERTY_CODE));
	if (!githubIssueTitleProperty) {
		console.log('No issue title property found in frontmatter');
		return;
	}

	console.log(`Raw issue title property: "${githubIssueTitleProperty}"`);

	// Extract everything after the property name and first colon
	// This ensures we get the complete title even if it contains colons
	const propertyPrefix = `${GITHUB_ISSUE_TITLE_PROPERTY_CODE}:`;
	const titlePart = githubIssueTitleProperty.substring(propertyPrefix.length).trim();
	
	console.log(`Extracted title part: "${titlePart}"`);
	
	// Handle quoted strings properly
	if (titlePart.startsWith('"') && titlePart.endsWith('"')) {
		// Remove the quotes and unescape any escaped quotes inside
		const unquotedTitle = titlePart.substring(1, titlePart.length - 1).replace(/\\"/g, '"');
		console.log(`Unquoted title: "${unquotedTitle}"`);
		return unquotedTitle;
	}
	
	return titlePart;
}

export function writeIssueTitle(data: string, issueTitle: string) {
	const { properties } = readProperties(data);
	// Escape the title for YAML
	const escapedTitle = escapeYamlString(issueTitle);

	return [
		PROPERTIES_DELIMITER,
		...(properties
			? [...properties.filter((p) => !p.includes(GITHUB_ISSUE_TITLE_PROPERTY_CODE))]
			: []),
		`${GITHUB_ISSUE_TITLE_PROPERTY_CODE}: ${escapedTitle}`,
		PROPERTIES_DELIMITER
	].join('\n');
}
