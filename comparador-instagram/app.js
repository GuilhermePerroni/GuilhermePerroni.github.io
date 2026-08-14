(function initializeComparator() {
    "use strict";

    const MAX_ZIP_SIZE = 100 * 1024 * 1024;
    const MAX_RELATIONSHIP_DATA_SIZE = 100 * 1024 * 1024;
    const PAGE_SIZE = 100;

    const listMetadata = {
        notFollowing: {
            description: "Contas que você segue e não seguem você de volta.",
            title: "NÃO SEGUEM VOCÊ DE VOLTA",
            status: "Não segue você de volta",
            fileSlug: "nao-seguem-de-volta"
        },
        notFollowed: {
            description: "Contas que seguem você, mas que você não segue de volta.",
            title: "SEGUEM VOCÊ, MAS VOCÊ NÃO SEGUE",
            status: "Você não segue de volta",
            fileSlug: "voce-nao-segue"
        },
        mutual: {
            description: "Contas em que o seguimento é mútuo.",
            title: "SEGUIMENTO MÚTUO",
            status: "Seguimento mútuo",
            fileSlug: "seguimento-mutuo"
        }
    };

    const elements = {
        uploadCard: document.getElementById("ferramenta"),
        dropZone: document.getElementById("drop-zone"),
        fileInput: document.getElementById("zip-file"),
        selectedFile: document.getElementById("selected-file"),
        selectedFileName: document.getElementById("selected-file-name"),
        selectedFileSize: document.getElementById("selected-file-size"),
        removeFile: document.getElementById("remove-file"),
        analyzeButton: document.getElementById("analyze-button"),
        progressPanel: document.getElementById("progress-panel"),
        progressLabel: document.getElementById("progress-label"),
        progressValue: document.getElementById("progress-value"),
        progressBar: document.getElementById("progress-bar"),
        progressTrack: document.querySelector(".progress-track"),
        errorMessage: document.getElementById("error-message"),
        errorCopy: document.getElementById("error-copy"),
        resultsSection: document.getElementById("resultados"),
        resultsTitle: document.getElementById("results-title"),
        resultFileLabel: document.getElementById("result-file-label"),
        followersCount: document.getElementById("followers-count"),
        followingCount: document.getElementById("following-count"),
        notFollowingCount: document.getElementById("not-following-count"),
        notFollowingDetail: document.getElementById("not-following-detail"),
        notFollowedCount: document.getElementById("not-followed-count"),
        mutualCount: document.getElementById("mutual-count"),
        tabNotFollowingCount: document.getElementById("tab-not-following-count"),
        tabNotFollowedCount: document.getElementById("tab-not-followed-count"),
        tabMutualCount: document.getElementById("tab-mutual-count"),
        tabButtons: Array.from(document.querySelectorAll(".tab-button")),
        accountPanel: document.getElementById("account-panel"),
        accountList: document.getElementById("account-list"),
        accountSearch: document.getElementById("account-search"),
        listDescription: document.getElementById("list-description"),
        listTotal: document.getElementById("list-total"),
        removedFilter: document.getElementById("removed-filter"),
        includeRemoved: document.getElementById("include-removed"),
        removedFilterCount: document.getElementById("removed-filter-count"),
        emptyState: document.getElementById("empty-state"),
        loadMore: document.getElementById("load-more"),
        copyList: document.getElementById("copy-list"),
        downloadTxt: document.getElementById("download-txt"),
        downloadCsv: document.getElementById("download-csv"),
        newAnalysis: document.getElementById("new-analysis"),
        toast: document.getElementById("toast"),
        toastIcon: document.getElementById("toast-icon"),
        toastMessage: document.getElementById("toast-message")
    };

    const state = {
        file: null,
        result: null,
        activeList: "notFollowing",
        includeRemoved: false,
        query: "",
        visibleCount: PAGE_SIZE,
        busy: false,
        toastTimer: null
    };

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function scrollBehavior() {
        return prefersReducedMotion ? "auto" : "smooth";
    }

    function formatNumber(value) {
        return new Intl.NumberFormat("pt-BR").format(value);
    }

    function formatBytes(bytes) {
        if (bytes < 1024) {
            return `${bytes} B`;
        }

        const units = ["KB", "MB", "GB"];
        let size = bytes / 1024;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }

        const precision = size >= 10 ? 1 : 2;
        return `${size.toFixed(precision).replace(".", ",")} ${units[unitIndex]}`;
    }

    function isZipFile(file) {
        return file && /\.zip$/i.test(file.name);
    }

    function isRemovedAccount(username) {
        return username.startsWith("__deleted__");
    }

    function hideError() {
        elements.errorMessage.hidden = true;
        elements.errorCopy.textContent = "";
    }

    function showError(message) {
        elements.errorCopy.textContent = message;
        elements.errorMessage.hidden = false;
        elements.errorMessage.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    }

    function selectFile(file) {
        if (!file) {
            return;
        }

        hideError();
        clearResult();

        if (!isZipFile(file)) {
            clearSelectedFile();
            showError("Selecione o arquivo .zip baixado do Instagram.");
            return;
        }

        if (file.size > MAX_ZIP_SIZE) {
            clearSelectedFile();
            showError("O arquivo é grande demais para processar com segurança neste navegador. Solicite ao Instagram somente “Seguidores e seguindo”.");
            return;
        }

        state.file = file;
        elements.selectedFileName.textContent = file.name;
        elements.selectedFileSize.textContent = formatBytes(file.size);
        elements.dropZone.hidden = true;
        elements.selectedFile.hidden = false;
        elements.analyzeButton.disabled = false;
    }

    function clearSelectedFile() {
        clearResult();
        state.file = null;
        elements.fileInput.value = "";
        elements.selectedFile.hidden = true;
        elements.dropZone.hidden = false;
        elements.analyzeButton.disabled = true;
        elements.progressPanel.hidden = true;
        updateProgress(0, "Preparando a análise…");
    }

    function clearResult() {
        state.result = null;
        state.query = "";
        state.includeRemoved = false;
        elements.resultsSection.hidden = true;
        elements.accountSearch.value = "";
        elements.includeRemoved.checked = false;
    }

    function setBusy(isBusy) {
        state.busy = isBusy;
        elements.uploadCard.setAttribute("aria-busy", String(isBusy));
        elements.analyzeButton.disabled = isBusy || !state.file;
        elements.removeFile.disabled = isBusy;
        elements.fileInput.disabled = isBusy;

        if (isBusy) {
            elements.analyzeButton.querySelector("span").textContent = "Analisando…";
            elements.analyzeButton.querySelector("i").className = "fas fa-spinner fa-spin";
            elements.progressPanel.hidden = false;
        } else {
            elements.analyzeButton.querySelector("span").textContent = "Analisar meu ZIP";
            elements.analyzeButton.querySelector("i").className = "fas fa-arrow-right";
        }
    }

    function updateProgress(percent, label) {
        const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
        elements.progressLabel.textContent = label;
        elements.progressValue.textContent = `${safePercent}%`;
        elements.progressBar.style.width = `${safePercent}%`;
        elements.progressTrack.setAttribute("aria-valuenow", String(safePercent));
    }

    function findRelationshipEntries(zip) {
        const files = Object.values(zip.files).filter((entry) => !entry.dir);
        const groups = new Map();

        files.forEach((entry) => {
            const normalizedName = entry.name.replace(/\\/g, "/");
            const match = normalizedName.match(/^(.*?connections\/followers_and_following\/)(followers(?:_\d+)?\.(?:json|html)|following\.(?:json|html))$/i);
            if (!match) {
                return;
            }

            const groupKey = match[1].toLowerCase();
            const basename = match[2].toLowerCase();
            if (!groups.has(groupKey)) {
                groups.set(groupKey, { followers: [], following: [] });
            }

            const group = groups.get(groupKey);
            if (/^followers(?:_\d+)?\./.test(basename)) {
                group.followers.push(entry);
            } else {
                group.following.push(entry);
            }
        });

        const completeGroups = Array.from(groups.values()).filter((group) => group.followers.length > 0 && group.following.length > 0);
        if (completeGroups.length > 1) {
            throw new Error("MULTIPLAS_EXPORTACOES");
        }

        if (completeGroups.length === 0) {
            return { followers: [], following: [] };
        }

        const group = completeGroups[0];
        const preferJson = (entries) => {
            const jsonEntries = entries.filter((entry) => /\.json$/i.test(entry.name));
            return jsonEntries.length > 0 ? jsonEntries : entries.filter((entry) => /\.html$/i.test(entry.name));
        };

        const followers = preferJson(group.followers);
        const following = preferJson(group.following);
        if (following.length !== 1) {
            throw new Error("MULTIPLAS_EXPORTACOES");
        }

        followers.sort((first, second) => first.name.localeCompare(second.name, "pt-BR", { numeric: true }));
        return { followers, following };
    }

    function getUncompressedSize(entry) {
        const size = Number(entry?._data?.uncompressedSize);
        return Number.isFinite(size) && size >= 0 ? size : null;
    }

    async function readRelationshipEntry(entry, kind, entryIndex, totalEntries) {
        const progressSlice = 54 / Math.max(totalEntries, 1);
        const progressStart = 28 + (entryIndex * progressSlice);
        const label = kind === "followers" ? "Lendo sua lista de seguidores…" : "Lendo quem você segue…";

        const text = await entry.async("string", (metadata) => {
            updateProgress(progressStart + (metadata.percent / 100) * progressSlice, label);
        });

        return {
            usernames: /\.html$/i.test(entry.name)
                ? window.InstagramExportParser.parseHtmlText(text)
                : window.InstagramExportParser.parseJsonText(text, kind),
            decodedBytes: new Blob([text]).size
        };
    }

    function getReadableError(error) {
        const message = String(error?.message || error || "");

        if (message.includes("JSON_INVALIDO")) {
            return "Uma das listas do Instagram está com JSON inválido. Baixe a exportação novamente e tente com o ZIP original.";
        }

        if (/encrypted|password/i.test(message)) {
            return "Este ZIP parece estar protegido por senha. Use diretamente o arquivo de exportação fornecido pelo Instagram.";
        }

        if (/corrupt|central directory|signature|zip/i.test(message)) {
            return "Não foi possível abrir este ZIP. Confirme se ele foi baixado por completo e tente novamente.";
        }

        return "O arquivo não pôde ser lido. Baixe uma nova exportação do Instagram no formato JSON e tente novamente.";
    }

    async function analyzeFile() {
        if (!state.file || state.busy) {
            return;
        }

        hideError();
        clearResult();
        setBusy(true);
        updateProgress(7, "Abrindo o arquivo ZIP…");

        try {
            if (typeof window.JSZip !== "function") {
                throw new Error("A biblioteca necessária não foi carregada. Verifique sua conexão e recarregue a página.");
            }

            if (!window.InstagramExportParser) {
                throw new Error("O comparador não foi carregado corretamente. Recarregue a página.");
            }

            const zip = await window.JSZip.loadAsync(state.file);
            updateProgress(22, "Localizando seguidores e seguindo…");

            const entries = findRelationshipEntries(zip);
            if (entries.followers.length === 0 || entries.following.length === 0) {
                throw new Error("LISTAS_AUSENTES");
            }

            const relationshipEntries = [
                ...entries.followers.map((entry) => ({ entry, kind: "followers" })),
                ...entries.following.map((entry) => ({ entry, kind: "following" }))
            ];

            const relationshipDataSize = relationshipEntries.reduce((total, item) => {
                const size = getUncompressedSize(item.entry);
                return total + (size === null ? 0 : size);
            }, 0);
            if (relationshipDataSize > MAX_RELATIONSHIP_DATA_SIZE) {
                throw new Error("DADOS_GRANDES");
            }

            const followers = [];
            const following = [];
            let decodedBytes = 0;

            for (let index = 0; index < relationshipEntries.length; index += 1) {
                const item = relationshipEntries[index];
                const parsedEntry = await readRelationshipEntry(item.entry, item.kind, index, relationshipEntries.length);
                decodedBytes += parsedEntry.decodedBytes;
                if (decodedBytes > MAX_RELATIONSHIP_DATA_SIZE) {
                    throw new Error("DADOS_GRANDES");
                }

                const target = item.kind === "followers" ? followers : following;
                for (const username of parsedEntry.usernames) {
                    target.push(username);
                }
            }

            updateProgress(86, "Comparando os perfis…");
            await new Promise((resolve) => window.setTimeout(resolve, 30));

            const result = window.InstagramExportParser.compareAccounts(followers, following);
            if (result.followers.length === 0 && result.following.length === 0) {
                throw new Error("LISTAS_VAZIAS");
            }

            state.result = result;
            updateProgress(100, "Comparação concluída.");
            renderResults();
        } catch (error) {
            const code = String(error?.message || error || "");
            let message;

            if (code === "LISTAS_AUSENTES") {
                message = "Não encontrei as listas de seguidores e seguindo neste ZIP. Solicite uma exportação com “Seguidores e seguindo”, de preferência no formato JSON.";
            } else if (code === "MULTIPLAS_EXPORTACOES") {
                message = "Este ZIP contém mais de uma exportação de conta. Use o arquivo original de apenas um perfil do Instagram.";
            } else if (code === "ESTRUTURA_NAO_RECONHECIDA") {
                message = "Encontrei as listas, mas o formato dos dados não é reconhecido. Solicite uma nova exportação do Instagram em JSON.";
            } else if (code === "DADOS_GRANDES") {
                message = "As listas dentro deste arquivo são grandes demais para processar com segurança neste navegador.";
            } else if (code === "LISTAS_VAZIAS") {
                message = "O ZIP foi aberto, mas as listas de seguidores e seguindo estão vazias.";
            } else if (code.includes("biblioteca") || code.includes("comparador")) {
                message = code;
            } else {
                message = getReadableError(error);
            }

            showError(message);
            elements.progressPanel.hidden = true;
        } finally {
            setBusy(false);
        }
    }

    function setCount(element, value) {
        element.textContent = formatNumber(value);
    }

    function renderResults() {
        const result = state.result;
        state.activeList = "notFollowing";
        state.query = "";
        state.visibleCount = PAGE_SIZE;
        elements.accountSearch.value = "";

        setCount(elements.followersCount, result.followers.length);
        setCount(elements.followingCount, result.following.length);
        setCount(elements.notFollowingCount, result.notFollowing.length);
        setCount(elements.notFollowedCount, result.notFollowed.length);
        setCount(elements.mutualCount, result.mutual.length);
        setCount(elements.tabNotFollowingCount, result.notFollowing.length);
        setCount(elements.tabNotFollowedCount, result.notFollowed.length);
        setCount(elements.tabMutualCount, result.mutual.length);

        const removedCount = result.notFollowing.filter(isRemovedAccount).length;
        const activeCount = result.notFollowing.length - removedCount;
        elements.notFollowingDetail.textContent = removedCount > 0
            ? `${formatNumber(activeCount)} perfis ativos + ${formatNumber(removedCount)} removidas`
            : "não seguem de volta";

        elements.resultFileLabel.textContent = `Arquivo analisado: ${state.file.name}`;
        elements.resultsSection.hidden = false;
        activateTab("notFollowing", false);
        elements.resultsTitle.focus({ preventScroll: true });
        elements.resultsSection.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }

    function getFilteredAccounts() {
        const accounts = getCurrentAccounts();
        if (!state.query) {
            return accounts;
        }
        return accounts.filter((username) => username.includes(state.query));
    }

    function createAccountItem(username, index) {
        const item = document.createElement("li");
        item.className = "account-item";

        const indexElement = document.createElement("span");
        indexElement.className = "account-index";
        indexElement.textContent = formatNumber(index + 1);

        const avatar = document.createElement("span");
        avatar.className = "account-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = isRemovedAccount(username) ? "×" : username.charAt(0);

        const name = document.createElement("span");
        name.className = "account-name";
        name.textContent = `@${username}`;

        item.append(indexElement, avatar, name);

        if (isRemovedAccount(username)) {
            const removedBadge = document.createElement("span");
            removedBadge.className = "removed-badge";
            const icon = document.createElement("i");
            icon.className = "fas fa-user-slash";
            icon.setAttribute("aria-hidden", "true");
            removedBadge.append(icon, document.createTextNode(" Conta removida"));
            item.append(removedBadge);
        } else {
            const link = document.createElement("a");
            link.className = "profile-link";
            link.href = `https://www.instagram.com/${encodeURIComponent(username)}/`;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.setAttribute("aria-label", `Abrir @${username} no Instagram`);
            link.append(document.createTextNode("Abrir perfil "));
            const icon = document.createElement("i");
            icon.className = "fas fa-arrow-up-right-from-square";
            icon.setAttribute("aria-hidden", "true");
            link.append(icon);
            item.append(link);
        }

        return item;
    }

    function renderAccountList() {
        const filteredAccounts = getFilteredAccounts();
        const visibleAccounts = filteredAccounts.slice(0, state.visibleCount);
        const fragment = document.createDocumentFragment();

        elements.accountList.replaceChildren();
        visibleAccounts.forEach((username, index) => {
            fragment.append(createAccountItem(username, index));
        });
        elements.accountList.append(fragment);

        const hasNoResults = filteredAccounts.length === 0;
        elements.emptyState.hidden = !hasNoResults;
        elements.loadMore.hidden = hasNoResults || visibleAccounts.length >= filteredAccounts.length;

        const emptyTitle = elements.emptyState.querySelector("strong");
        const emptyCopy = elements.emptyState.querySelector("p");
        if (hasNoResults && !state.query) {
            const hiddenRemovedCount = (state.result?.[state.activeList] || []).filter(isRemovedAccount).length;
            if (!state.includeRemoved && hiddenRemovedCount > 0) {
                emptyTitle.textContent = "Somente contas removidas nesta lista";
                emptyCopy.textContent = "Marque “Incluir contas removidas” para exibi-las.";
            } else {
                emptyTitle.textContent = state.activeList === "notFollowing"
                    ? "Todas as contas seguem você de volta"
                    : "Esta lista está vazia";
                emptyCopy.textContent = "Não há perfis para mostrar nesta categoria.";
            }
        } else {
            emptyTitle.textContent = "Nenhuma conta encontrada";
            emptyCopy.textContent = "Tente buscar por outro nome de usuário.";
        }

        if (hasNoResults) {
            elements.listTotal.textContent = "0 contas";
        } else if (visibleAccounts.length < filteredAccounts.length) {
            elements.listTotal.textContent = `Exibindo ${formatNumber(visibleAccounts.length)} de ${formatNumber(filteredAccounts.length)}`;
        } else {
            elements.listTotal.textContent = `${formatNumber(filteredAccounts.length)} ${filteredAccounts.length === 1 ? "conta" : "contas"}`;
        }
    }

    function activateTab(listName, focusTab = true) {
        if (!listMetadata[listName]) {
            return;
        }

        state.activeList = listName;
        state.query = "";
        state.includeRemoved = false;
        state.visibleCount = PAGE_SIZE;
        elements.accountSearch.value = "";
        elements.includeRemoved.checked = false;

        elements.tabButtons.forEach((button) => {
            const isActive = button.dataset.list === listName;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", String(isActive));
            button.tabIndex = isActive ? 0 : -1;
            if (isActive) {
                elements.accountPanel.setAttribute("aria-labelledby", button.id);
                if (focusTab) {
                    button.focus();
                }
            }
        });

        updateRemovedFilter();
        renderAccountList();
    }

    function updateRemovedFilter() {
        const accounts = state.result?.[state.activeList] || [];
        const removedCount = accounts.filter(isRemovedAccount).length;
        elements.removedFilter.hidden = removedCount === 0;
        elements.removedFilterCount.textContent = formatNumber(removedCount);

        const hiddenNote = removedCount > 0 && !state.includeRemoved
            ? ` ${formatNumber(removedCount)} ${removedCount === 1 ? "conta removida está oculta" : "contas removidas estão ocultas"}.`
            : "";
        elements.listDescription.textContent = `${listMetadata[state.activeList].description}${hiddenNote}`;
    }

    function getCurrentAccounts() {
        const accounts = state.result?.[state.activeList] || [];
        return state.includeRemoved ? accounts : accounts.filter((username) => !isRemovedAccount(username));
    }

    function buildTextReport() {
        const result = state.result;
        const accounts = getCurrentAccounts();
        const metadata = listMetadata[state.activeList];
        const date = new Intl.DateTimeFormat("pt-BR").format(new Date());

        return [
            "RELATÓRIO DE SEGUIDORES - INSTAGRAM",
            `Gerado em: ${date}`,
            `Seguidores únicos: ${result.followers.length}`,
            `Seguindo únicos: ${result.following.length}`,
            `Não seguem você de volta: ${result.notFollowing.length}`,
            `Você não segue de volta: ${result.notFollowed.length}`,
            `Seguimento mútuo: ${result.mutual.length}`,
            `Contas removidas nesta lista: ${state.includeRemoved ? "incluídas" : "ocultas"}`,
            "",
            `${metadata.title} (${accounts.length})`,
            "",
            ...accounts.map((username) => `@${username}`)
        ].join("\n");
    }

    function csvEscape(value) {
        return `"${String(value).replace(/"/g, '""')}"`;
    }

    function buildCsvReport() {
        const metadata = listMetadata[state.activeList];
        const rows = getCurrentAccounts().map((username) => [
            `@${username}`,
            isRemovedAccount(username) ? "" : `https://www.instagram.com/${username}/`,
            isRemovedAccount(username) ? "Conta removida" : metadata.status
        ]);

        return "\ufeff" + [
            ["usuario", "url", "situacao"],
            ...rows
        ].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    }

    function downloadFile(content, extension, mimeType) {
        const metadata = listMetadata[state.activeList];
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `instagram-${metadata.fileSlug}.${extension}`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function copyCurrentList() {
        const text = getCurrentAccounts().map((username) => `@${username}`).join("\n");

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";
                document.body.append(textArea);
                textArea.select();
                const copied = document.execCommand("copy");
                textArea.remove();
                if (!copied) {
                    throw new Error("COPY_FAILED");
                }
            }
            showToast(`${formatNumber(getCurrentAccounts().length)} contas copiadas.`);
        } catch (_error) {
            showToast("Não foi possível copiar. Baixe a lista em TXT.", true);
        }
    }

    function showToast(message, isError = false) {
        window.clearTimeout(state.toastTimer);
        elements.toastMessage.textContent = message;
        elements.toastIcon.className = isError ? "fas fa-circle-exclamation" : "fas fa-circle-check";
        elements.toast.style.background = isError ? "var(--danger)" : "var(--success)";
        elements.toast.hidden = false;
        state.toastTimer = window.setTimeout(() => {
            elements.toast.hidden = true;
        }, 3200);
    }

    function resetAnalysis() {
        hideError();
        clearSelectedFile();
        elements.dropZone.focus();
        elements.uploadCard.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    }

    elements.dropZone.addEventListener("click", () => {
        if (!state.busy) {
            elements.fileInput.click();
        }
    });

    elements.dropZone.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && !state.busy) {
            event.preventDefault();
            elements.fileInput.click();
        }
    });

    elements.fileInput.addEventListener("change", (event) => {
        selectFile(event.target.files?.[0]);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            if (!state.busy) {
                elements.dropZone.classList.add("is-dragging");
            }
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.remove("is-dragging");
        });
    });

    elements.dropZone.addEventListener("drop", (event) => {
        if (!state.busy) {
            selectFile(event.dataTransfer?.files?.[0]);
        }
    });

    elements.removeFile.addEventListener("click", () => {
        if (!state.busy) {
            hideError();
            clearSelectedFile();
            elements.dropZone.focus();
        }
    });

    elements.analyzeButton.addEventListener("click", analyzeFile);
    elements.newAnalysis.addEventListener("click", resetAnalysis);

    elements.tabButtons.forEach((button, index) => {
        button.addEventListener("click", () => activateTab(button.dataset.list));
        button.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
            }
            event.preventDefault();
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const nextIndex = (index + direction + elements.tabButtons.length) % elements.tabButtons.length;
            activateTab(elements.tabButtons[nextIndex].dataset.list);
        });
    });

    elements.accountSearch.addEventListener("input", (event) => {
        state.query = window.InstagramExportParser.normalizeUsername(event.target.value) || event.target.value.trim().replace(/^@/, "").toLowerCase();
        state.visibleCount = PAGE_SIZE;
        renderAccountList();
    });

    elements.includeRemoved.addEventListener("change", (event) => {
        state.includeRemoved = event.target.checked;
        state.visibleCount = PAGE_SIZE;
        updateRemovedFilter();
        renderAccountList();
    });

    elements.loadMore.addEventListener("click", () => {
        state.visibleCount += PAGE_SIZE;
        renderAccountList();
    });

    elements.copyList.addEventListener("click", copyCurrentList);
    elements.downloadTxt.addEventListener("click", () => {
        downloadFile(buildTextReport(), "txt", "text/plain");
        showToast("Lista TXT baixada.");
    });
    elements.downloadCsv.addEventListener("click", () => {
        downloadFile(buildCsvReport(), "csv", "text/csv");
        showToast("Lista CSV baixada.");
    });

    document.querySelector(".skip-link").addEventListener("click", () => {
        window.setTimeout(() => elements.uploadCard.focus({ preventScroll: true }), 0);
    });
})();
