(function attachInstagramExportParser(globalScope) {
    "use strict";

    const reservedPathSegments = new Set([
        "accounts",
        "about",
        "developer",
        "directory",
        "explore",
        "legal",
        "privacy",
        "reels",
        "stories",
        "web",
        "_u"
    ]);

    const collator = new Intl.Collator("pt-BR", {
        sensitivity: "base",
        numeric: true
    });

    function normalizeUsername(input) {
        if (typeof input !== "string") {
            return "";
        }

        let value = input.trim();
        if (!value) {
            return "";
        }

        value = value.replace(/^@+/, "");

        if (/^(?:https?:\/\/|\/\/|www\.)/i.test(value)) {
            try {
                const normalizedUrl = value.startsWith("//")
                    ? `https:${value}`
                    : value.startsWith("www.")
                        ? `https://${value}`
                        : value;
                const url = new URL(normalizedUrl);
                if (!/(^|\.)instagram\.com$/i.test(url.hostname)) {
                    return "";
                }

                const parts = url.pathname
                    .split("/")
                    .filter(Boolean)
                    .map((part) => decodeURIComponent(part));

                if (parts[0] === "_u" && parts.length === 2 && parts[1]) {
                    value = parts[1];
                } else if (parts.length === 1) {
                    value = parts[0] || "";
                } else {
                    return "";
                }
            } catch (_error) {
                return "";
            }
        }

        value = value
            .split(/[?#/]/, 1)[0]
            .trim()
            .replace(/^@+/, "")
            .toLowerCase();

        if (!value || reservedPathSegments.has(value)) {
            return "";
        }

        const maximumLength = value.startsWith("__deleted__") ? 100 : 30;
        if (!/^[a-z0-9._]+$/i.test(value) || value.length > maximumLength) {
            return "";
        }

        return value;
    }

    function getRecordArrays(data, kind) {
        if (Array.isArray(data)) {
            return [data];
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        const preferredKeys = kind === "followers"
            ? ["relationships_followers", "followers"]
            : ["relationships_following", "following"];

        const arrays = [];
        let recognized = false;
        preferredKeys.forEach((key) => {
            if (Array.isArray(data[key])) {
                recognized = true;
                arrays.push(data[key]);
            }
        });

        if (recognized) {
            return arrays;
        }

        Object.entries(data).forEach(([key, value]) => {
            if (Array.isArray(value) && key.toLowerCase().includes(kind === "followers" ? "follower" : "following")) {
                recognized = true;
                arrays.push(value);
            }
        });

        return recognized ? arrays : null;
    }

    function extractUsernameFromRecord(record, kind) {
        if (!record || typeof record !== "object") {
            return "";
        }

        const stringData = Array.isArray(record.string_list_data)
            ? record.string_list_data
            : [];
        const candidates = [];

        if (kind === "following" && typeof record.title === "string") {
            candidates.push(record.title);
        }

        stringData.forEach((item) => {
            if (!item || typeof item !== "object") {
                return;
            }
            if (typeof item.value === "string") {
                candidates.push(item.value);
            }
            if (typeof item.href === "string") {
                candidates.push(item.href);
            }
        });

        if (kind === "followers" && typeof record.title === "string") {
            candidates.push(record.title);
        }

        for (const candidate of candidates) {
            const username = normalizeUsername(candidate);
            if (username) {
                return username;
            }
        }

        return "";
    }

    function parseJsonText(text, kind) {
        let data;
        try {
            data = JSON.parse(text);
        } catch (_error) {
            throw new Error("JSON_INVALIDO");
        }

        const recordArrays = getRecordArrays(data, kind);
        if (recordArrays === null) {
            throw new Error("ESTRUTURA_NAO_RECONHECIDA");
        }

        const records = recordArrays.flat();
        const usernames = records
            .map((record) => extractUsernameFromRecord(record, kind))
            .filter(Boolean);

        if (records.length > 0 && usernames.length === 0) {
            throw new Error("ESTRUTURA_NAO_RECONHECIDA");
        }

        return usernames;
    }

    function isInstagramHref(href) {
        if (typeof href !== "string" || !/^(?:https?:)?\/\//i.test(href.trim())) {
            return false;
        }

        try {
            const url = new URL(href.startsWith("//") ? `https:${href}` : href);
            return /(^|\.)instagram\.com$/i.test(url.hostname);
        } catch (_error) {
            return false;
        }
    }

    function parseHtmlText(text) {
        const usernames = [];
        const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = anchorPattern.exec(text)) !== null) {
            const href = match[1].replace(/&amp;/g, "&");
            const username = isInstagramHref(href) ? normalizeUsername(href) : "";

            if (username) {
                usernames.push(username);
            }
        }

        return usernames;
    }
    function uniqueSorted(usernames) {
        return Array.from(new Set(usernames.map(normalizeUsername).filter(Boolean)))
            .sort((first, second) => collator.compare(first, second));
    }

    function compareAccounts(followersInput, followingInput) {
        const followers = uniqueSorted(followersInput);
        const following = uniqueSorted(followingInput);
        const followerSet = new Set(followers);
        const followingSet = new Set(following);

        const notFollowing = following.filter((username) => !followerSet.has(username));
        const notFollowed = followers.filter((username) => !followingSet.has(username));
        const mutual = following.filter((username) => followerSet.has(username));

        return {
            followers,
            following,
            notFollowing,
            notFollowed,
            mutual
        };
    }

    const api = {
        compareAccounts,
        extractUsernameFromRecord,
        normalizeUsername,
        parseHtmlText,
        parseJsonText,
        uniqueSorted
    };

    globalScope.InstagramExportParser = api;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== "undefined" ? globalThis : window);
