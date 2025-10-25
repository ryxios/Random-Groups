<script lang="ts">
        import { browser } from '$app/environment';
        import { onMount } from 'svelte';
        import type { GroupingConfig, GroupingResult, LearnerRecord, StoredClass } from '$lib/types';
        import RelationshipSelector from '$lib/components/RelationshipSelector.svelte';
        import { generateId } from '$lib/utils/id';
        import {
                deleteClass,
                listClasses,
                loadClass,
                saveClass
        } from '$lib/db/classes';
        import {
                exportToCsv,
                exportToJson,
                importFromCsv,
                importFromJson
        } from '$lib/utils/importExport';

        let learners: LearnerRecord[] = [];
        let className = 'Neue Klasse';
        let currentClassId: string | null = null;
        let savedClasses: StoredClass[] = [];
        let selectedStoredClass = '';
        let errorMessage = '';
        let createClassModalOpen = false;
        let createClassName = '';
        let createClassLearnerText = '';
        let createClassImportWarnings: string[] = [];
        let createClassError = '';
        let importedLearnerDraft: LearnerRecord[] = [];
        let learnersPanelOpen = false;

        type LegacyLearnerRecord = Omit<LearnerRecord, 'prefer' | 'avoid' | 'never'> & {
                prefer?: string[];
                avoid?: string[];
                never?: string[];
        };

        function normalizeLearner(entry: LegacyLearnerRecord | LearnerRecord): LearnerRecord {
                return {
                        ...entry,
                        prefer: entry.prefer ?? [],
                        avoid: entry.avoid ?? [],
                        never: entry.never ?? [],
                        notes: entry.notes
                };
        }

        let newLearnerName = '';
        let newLearnerNotes = '';
        let newLearnerPerformance: LearnerRecord['performance'] = 'medium';

        let config: GroupingConfig = {
                mode: 'groupSize',
                groupSize: 4,
                groupCount: 3,
                balancePerformance: true
        };

        let worker: Worker | null = null;
        let generating = false;
        let result: GroupingResult | null = null;
        let settingsOpen = false;
        let activeLearnerId: string | null = null;

        $: sortedLearners = [...learners].sort((a, b) =>
                a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })
        );

        $: relationshipOptions = sortedLearners.map((entry) => ({ id: entry.id, name: entry.name }));
        $: availableRelationshipOptions = activeLearner
                ? relationshipOptions.filter((option) => option.id !== activeLearner.id)
                : [];

        $: activeLearner =
                activeLearnerId ? learners.find((entry) => entry.id === activeLearnerId) ?? null : null;

        $: hasActiveClass = currentClassId !== null || learners.length > 0;
        $: displayedClassName = hasActiveClass ? className?.trim() || 'Unbenannte Klasse' : 'Keine Klasse geladen';

        $: if (activeLearnerId && !activeLearner) {
                closeLearnerSettings();
        }

        onMount(() => {
                if (!browser) return;
                initWorker();
                refreshSavedClasses();

                return () => {
                        worker?.terminate();
                };
        });

        function initWorker() {
                worker = new Worker(new URL('$lib/workers/groupingWorker.ts', import.meta.url), {
                        type: 'module'
                });

                worker.onmessage = (event: MessageEvent<GroupingResult>) => {
                        result = event.data;
                        generating = false;
                };

                worker.onerror = (event) => {
                        errorMessage = event.message;
                        generating = false;
                };
        }

        async function refreshSavedClasses() {
                if (!browser) return;
                savedClasses = await listClasses();
        }

        function resetResult() {
                if (result !== null) {
                        result = null;
                }
        }

        function openLearnerSettings(id: string) {
                activeLearnerId = id;
                settingsOpen = true;
        }

        function closeLearnerSettings() {
                settingsOpen = false;
                activeLearnerId = null;
        }

        function handleSettingsKeydown(event: KeyboardEvent) {
                if (settingsOpen && event.key === 'Escape') {
                        closeLearnerSettings();
                }

                if (createClassModalOpen && event.key === 'Escape') {
                        closeCreateClassModal();
                }
        }

        function updateLearnerName(id: string, name: string) {
                learners = learners.map((entry) => (entry.id === id ? { ...entry, name } : entry));
                resetResult();
        }

        function updateLearnerPerformance(
                id: string,
                performance: LearnerRecord['performance']
        ) {
                learners = learners.map((entry) =>
                        entry.id === id ? { ...entry, performance } : entry
                );
                resetResult();
        }

        function updateLearnerNotes(id: string, notes: string) {
                learners = learners.map((entry) =>
                        entry.id === id ? { ...entry, notes: notes.trim() || undefined } : entry
                );
                resetResult();
        }

        function handleOverlayKeydown(event: KeyboardEvent) {
                if (event.key === 'Escape') {
                        event.preventDefault();
                        closeLearnerSettings();
                }
        }

        function handleOverlayClick(event: MouseEvent) {
                if (event.target === event.currentTarget) {
                        closeLearnerSettings();
                }
        }

        function closeCreateClassModal() {
                createClassModalOpen = false;
        }

        function openCreateClassModal() {
                createClassModalOpen = true;
                createClassName = '';
                createClassLearnerText = '';
                createClassImportWarnings = [];
                createClassError = '';
                importedLearnerDraft = [];
        }

        function handleCreateOverlayKeydown(event: KeyboardEvent) {
                if (event.key === 'Escape') {
                        event.preventDefault();
                        closeCreateClassModal();
                }
        }

        function handleCreateOverlayClick(event: MouseEvent) {
                if (event.target === event.currentTarget) {
                        closeCreateClassModal();
                }
        }

        function addLearner() {
                if (!newLearnerName.trim()) {
                        errorMessage = 'Bitte einen Namen eingeben.';
                        return;
                }

                const learner: LearnerRecord = {
                        id: generateId('learner'),
                        name: newLearnerName.trim(),
                        performance: newLearnerPerformance,
                        prefer: [],
                        avoid: [],
                        never: [],
                        notes: newLearnerNotes.trim() || undefined
                };

                learners = [...learners, learner];
                newLearnerName = '';
                newLearnerNotes = '';
                newLearnerPerformance = 'medium';
                errorMessage = '';
                resetResult();
        }

        function removeLearner(id: string) {
                learners = learners
                        .filter((entry) => entry.id !== id)
                        .map((entry) => ({
                                ...entry,
                                prefer: entry.prefer.filter((ref) => ref !== id),
                                avoid: entry.avoid.filter((ref) => ref !== id),
                                never: entry.never.filter((ref) => ref !== id)
                        }));
                resetResult();
        }

        function handlePerformanceSelect(event: Event, learnerId: string) {
                const target = event.currentTarget as HTMLSelectElement | null;
                if (!target) return;
                updateLearnerPerformance(learnerId, target.value as LearnerRecord['performance']);
        }

        function updateLearnerRelationships(
                learnerId: string,
                kind: 'prefer' | 'avoid' | 'never',
                values: string[]
        ) {
                const sanitized = Array.from(new Set(values.filter((value) => value !== learnerId)));
                const removeDuplicates = (list: string[]) => list.filter((id) => !sanitized.includes(id));

                learners = learners.map((entry) =>
                        entry.id === learnerId
                                ? {
                                          ...entry,
                                          prefer:
                                                  kind === 'prefer' ? sanitized : removeDuplicates(entry.prefer),
                                          avoid:
                                                  kind === 'avoid' ? sanitized : removeDuplicates(entry.avoid),
                                          never:
                                                  kind === 'never' ? sanitized : removeDuplicates(entry.never)
                                  }
                                : entry
                );
                resetResult();
        }

        function handleModeChange(mode: GroupingConfig['mode']) {
                config = { ...config, mode };
                resetResult();
        }

        async function handleGenerate() {
                if (!worker) return;
                generating = true;
                errorMessage = '';
                worker.postMessage({ learners, config });
        }

        function handleExport(type: 'csv' | 'json') {
                if (!learners.length) {
                        errorMessage = 'Es sind keine Lernenden zum Export vorhanden.';
                        return;
                }

                const data = { learners };
                if (type === 'json') {
                        exportToJson(data, className || 'klasse');
                } else {
                        exportToCsv(data, className || 'klasse');
                }
        }

        async function handleSave() {
                if (!browser) return;
                const trimmedName = className.trim() || 'Unbenannte Klasse';
                const id = currentClassId ?? generateId('class');
                const stored = await saveClass({
                        id,
                        name: trimmedName,
                        data: { learners }
                });
                currentClassId = stored.id;
                className = stored.name;
                await refreshSavedClasses();
                errorMessage = '';
        }

        async function handleLoad() {
                if (!browser || !selectedStoredClass) return;
                const stored = await loadClass(selectedStoredClass);
                if (!stored) return;
                learners = stored.data.learners.map((entry) => normalizeLearner(entry));
                className = stored.name;
                currentClassId = stored.id;
                learnersPanelOpen = false;
                resetResult();
        }

        async function handleDelete() {
                if (!browser || !selectedStoredClass) return;
                await deleteClass(selectedStoredClass);
                if (selectedStoredClass === currentClassId) {
                        currentClassId = null;
                }
                selectedStoredClass = '';
                await refreshSavedClasses();
        }

        function performanceLabel(level: LearnerRecord['performance']) {
                switch (level) {
                        case 'high':
                                return 'hoch';
                        case 'low':
                                return 'unterstützend';
                        default:
                                return 'mittel';
                }
        }

        async function handleCreateClassImport(event: Event, type: 'csv' | 'json') {
                const input = event.currentTarget as HTMLInputElement;
                const files = input?.files;
                if (!files || !files[0]) return;
                const file = files[0];

                try {
                        const result =
                                type === 'json' ? await importFromJson(file) : await importFromCsv(file);
                        importedLearnerDraft = result.data.learners.map((entry) => normalizeLearner(entry));
                        createClassImportWarnings = result.warnings;
                        createClassError = '';
                } catch (error) {
                        createClassError =
                                error instanceof Error
                                        ? error.message
                                        : 'Import fehlgeschlagen. Bitte prüfen Sie die Datei.';
                }

                if (input) {
                        input.value = '';
                }
        }

        function parseLearnersFromText(text: string): LearnerRecord[] {
                return text
                        .split(/[,\n]/)
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0)
                        .map((name) => ({
                                id: generateId('learner'),
                                name,
                                performance: 'medium',
                                prefer: [],
                                avoid: [],
                                never: [] as string[],
                                notes: undefined
                        }));
        }

        async function createNewClass() {
                const trimmedName = createClassName.trim() || 'Neue Klasse';
                const manualLearners = parseLearnersFromText(createClassLearnerText);
                const combined = [
                        ...importedLearnerDraft.map((entry) => normalizeLearner(entry)),
                        ...manualLearners
                ];

                learners = combined;
                className = trimmedName;
                currentClassId = null;
                learnersPanelOpen = false;
                resetResult();

                await handleSave();
                selectedStoredClass = currentClassId ?? '';
                closeCreateClassModal();
        }
</script>

<svelte:window on:keydown={handleSettingsKeydown} />

<svelte:head>
        <title>Zufällige Lerngruppen</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 pt-10 pb-24">
        <header class="rounded-xl bg-surface-200-800/70 p-6 shadow-lg">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div class="space-y-2">
                                <h1 class="text-3xl font-semibold">Zufällige Lerngruppen planen</h1>
                                <p class="text-base opacity-80">
                                        Erstellen Sie ausgewogene Gruppen basierend auf Teamregeln, Leistungsniveaus und persönlichen Präferenzen. Im- und Export, lokale Speicherung und Offline-Unterstützung sind integriert.
                                </p>
                        </div>
                </div>
        </header>

        <section class="grid gap-6 rounded-xl bg-surface-100-900/60 p-6 shadow">
                <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div class="flex-1">
                                <h2 class="text-xl font-semibold">Gespeicherte Klassen</h2>
                                <p class="text-sm opacity-75">
                                        Wählen Sie eine Klasse aus der Liste aus oder erstellen Sie über das Plus-Symbol eine neue.
                                </p>
                        </div>
                        <div class="flex items-end gap-3">
                                <button
                                        class="btn bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                        type="button"
                                        on:click={handleLoad}
                                        disabled={!selectedStoredClass}
                                >
                                        Laden
                                </button>
                                <button
                                        class="btn border border-rose-500 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                        type="button"
                                        on:click={handleDelete}
                                        disabled={!selectedStoredClass}
                                >
                                        Löschen
                                </button>
                        </div>
                </div>
                <label class="flex flex-col gap-2">
                        <span class="text-sm font-medium">Vorhandene Klassen</span>
                        <select class="input" bind:value={selectedStoredClass}>
                                <option value="">– Auswahl –</option>
                                {#each savedClasses as stored (stored.id)}
                                        <option value={stored.id}>{stored.name}</option>
                                {/each}
                        </select>
                </label>
        </section>

        

        <section class="rounded-xl bg-surface-100-900/60 p-6 shadow">
                <details
                        class="group rounded-lg border border-slate-200 bg-white/90 p-4 dark:border-slate-700/80 dark:bg-surface-200-800/80"
                        bind:open={learnersPanelOpen}
                >
                        <summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-left">
                                <div class="space-y-1">
                                        <p class="text-lg font-semibold">
                                                {displayedClassName}
                                        </p>
                                        <p class="text-sm text-slate-500 dark:text-slate-300">
                                                {learners.length} Lernende erfasst
                                        </p>
                                </div>
                                <span class="text-sm font-medium text-sky-600">
                                        {learnersPanelOpen ? 'Schließen' : 'Anzeigen'}
                                </span>
                        </summary>
                        <div class="mt-4 space-y-6">
                                <div class="grid gap-4 md:grid-cols-[2fr_auto] md:items-end">
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">Klassenname</span>
                                                <input
                                                        class="input"
                                                        type="text"
                                                        bind:value={className}
                                                        on:input={resetResult}
                                                        placeholder="z. B. Deutsch 10B"
                                                />
                                        </label>
                                        <div class="flex flex-wrap gap-3 md:justify-end">
                                                <button
                                                        class="btn bg-sky-600 text-white hover:bg-sky-700"
                                                        type="button"
                                                        on:click={handleSave}
                                                >
                                                        Speichern
                                                </button>
                                                <button
                                                        class="btn border border-slate-400 text-slate-700 hover:bg-slate-100"
                                                        type="button"
                                                        on:click={() => handleExport('json')}
                                                >
                                                        Als JSON exportieren
                                                </button>
                                                <button
                                                        class="btn border border-slate-400 text-slate-700 hover:bg-slate-100"
                                                        type="button"
                                                        on:click={() => handleExport('csv')}
                                                >
                                                        Als CSV exportieren
                                                </button>
                                        </div>
                                </div>

                                <div class="grid gap-4 md:grid-cols-3">
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">Name</span>
                                                <input class="input" type="text" bind:value={newLearnerName} placeholder="Max Mustermann" />
                                        </label>
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">Leistungsniveau</span>
                                                <select class="input" bind:value={newLearnerPerformance}>
                                                        <option value="high">hoch</option>
                                                        <option value="medium">mittel</option>
                                                        <option value="low">unterstützend</option>
                                                </select>
                                        </label>
                                        <label class="flex flex-col gap-2 md:col-span-1">
                                                <span class="text-sm font-medium">Notiz (optional)</span>
                                                <input class="input" type="text" bind:value={newLearnerNotes} placeholder="z. B. arbeitet gerne ruhig" />
                                        </label>
                                </div>
                                <button
                                        class="btn self-start bg-sky-600 text-white hover:bg-sky-700"
                                        type="button"
                                        on:click={addLearner}
                                >
                                        Lernende hinzufügen
                                </button>

                                {#if learners.length === 0}
                                        <p class="text-sm opacity-70">Noch keine Lernenden erfasst.</p>
                                {:else}
                                        <ul class="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm dark:divide-slate-700/80 dark:border-slate-700/80 dark:bg-surface-200-800/80">
                                                {#each sortedLearners as learner (learner.id)}
                                                        <li class="flex items-center justify-between gap-3 px-4 py-3">
                                                                <div class="min-w-0 flex-1">
                                                                        <p class="truncate font-medium">{learner.name}</p>
                                                                        <p class="text-xs text-slate-500 dark:text-slate-400">
                                                                                {performanceLabel(learner.performance)} · {learner.prefer.length} Wunschkontakte · {learner.avoid.length} Trennungen · {learner.never.length} Nie zusammen
                                                                        </p>
                                                                </div>
                                                                <div class="flex items-center gap-2">
                                                                        <button
                                                                                class="btn btn-icon border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                                                                                type="button"
                                                                                aria-label={`Einstellungen für ${learner.name} öffnen`}
                                                                                on:click={() => openLearnerSettings(learner.id)}
                                                                        >
                                                                                ⚙️
                                                                        </button>
                                                                        <button
                                                                                class="btn btn-icon border border-transparent bg-rose-600 text-white hover:bg-rose-700"
                                                                                type="button"
                                                                                aria-label={`Lernende·n ${learner.name} entfernen`}
                                                                                on:click={() => removeLearner(learner.id)}
                                                                        >
                                                                                ✕
                                                                        </button>
                                                                </div>
                                                        </li>
                                                {/each}
                                        </ul>
                                {/if}
                        </div>
                </details>
        </section>

        <section class="grid gap-6 rounded-xl bg-surface-100-900/60 p-6 shadow">
                <h2 class="text-xl font-semibold">Gruppen-Konfiguration</h2>
                <div class="grid gap-4 md:grid-cols-2">
                        <div class="space-y-3">
                                <label class="flex items-center gap-3">
                                        <input
                                                type="radio"
                                                name="mode"
                                                value="groupSize"
                                                checked={config.mode === 'groupSize'}
                                                on:change={() => handleModeChange('groupSize')}
                                        />
                                        <span>Anzahl der Mitglieder pro Gruppe</span>
                                </label>
                                <label class="flex items-center gap-3">
                                        <input
                                                type="radio"
                                                name="mode"
                                                value="groupCount"
                                                checked={config.mode === 'groupCount'}
                                                on:change={() => handleModeChange('groupCount')}
                                        />
                                        <span>Feste Anzahl an Gruppen</span>
                                </label>
                                <label class="flex items-center gap-3">
                                        <input
                                                type="checkbox"
                                                checked={config.balancePerformance}
                                                on:change={(event) => {
                                                        config = { ...config, balancePerformance: event.currentTarget.checked };
                                                        resetResult();
                                                }}
                                        />
                                        <span>Leistungsniveaus ausbalancieren</span>
                                </label>
                        </div>
                        <div class="grid gap-3">
                                {#if config.mode === 'groupSize'}
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">Mitglieder pro Gruppe</span>
                                                <input
                                                        class="input"
                                                        type="number"
                                                        min="2"
                                                        value={config.groupSize ?? 2}
                                                        on:input={(event) => {
                                                                const value = Number(event.currentTarget.value);
                                                                config = { ...config, groupSize: Number.isFinite(value) ? value : 2 };
                                                                resetResult();
                                                        }}
                                                />
                                        </label>
                                {:else}
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">Anzahl Gruppen</span>
                                                <input
                                                        class="input"
                                                        type="number"
                                                        min="2"
                                                        value={config.groupCount ?? 2}
                                                        on:input={(event) => {
                                                                const value = Number(event.currentTarget.value);
                                                                config = { ...config, groupCount: Number.isFinite(value) ? value : 2 };
                                                                resetResult();
                                                        }}
                                                />
                                        </label>
                                {/if}
                                <button
                                        class="btn bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                        type="button"
                                        on:click={handleGenerate}
                                        disabled={generating}
                                >
                                        {generating ? 'Berechne …' : 'Gruppen bilden'}
                                </button>
                        </div>
                </div>
        </section>

        {#if errorMessage}
                <div class="rounded-xl border border-error-400/60 bg-error-100/50 p-4 text-error-900">
                        {errorMessage}
                </div>
        {/if}

        {#if result}
                <section class="grid gap-6 rounded-xl bg-surface-100-900/60 p-6 shadow">
                        <h2 class="text-xl font-semibold">Vorschlag</h2>
                        <div class="grid gap-4 md:grid-cols-2">
                                {#each result.groups as group (group.id)}
                                        <article class="card space-y-3">
                                                <header class="flex items-center justify-between">
                                                        <h3 class="text-lg font-semibold">{group.id}</h3>
                                                        <span class="text-sm opacity-70">{group.members.length} Mitglieder</span>
                                                </header>
                                                <ul class="space-y-2 text-sm">
                                                        {#each group.members as member (member.id)}
                                                                <li class="rounded-lg bg-surface-200-800/70 px-3 py-2">
                                                                        <div class="font-medium">{member.name}</div>
                                                                </li>
                                                        {/each}
                                                </ul>
                                        </article>
                                {/each}
                        </div>
                        {#if result.unassigned.length}
                                <div class="rounded-lg border border-warning-400/50 bg-warning-100/60 p-4 text-sm text-warning-900">
                                        <h3 class="mb-2 font-semibold">Nicht zugewiesen</h3>
                                        <ul class="list-disc pl-5">
                                                {#each result.unassigned as learner (learner.id)}
                                                        <li>{learner.name}</li>
                                                {/each}
                                        </ul>
                                </div>
                        {/if}
                </section>
        {/if}

        <button
                class="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-3xl text-white shadow-lg transition hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-300 dark:bg-sky-500 dark:hover:bg-sky-400 dark:focus:ring-sky-700"
                type="button"
                on:click={openCreateClassModal}
                aria-label="Neue Klasse anlegen"
        >
                ➕
        </button>

        {#if createClassModalOpen}
                <div
                        class="fixed inset-0 z-40 grid place-items-center bg-slate-900/60 px-4 py-6"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="create-class-title"
                        tabindex="-1"
                        on:keydown={handleCreateOverlayKeydown}
                        on:click={handleCreateOverlayClick}
                >
                        <form
                                class="w-full max-w-2xl space-y-6 rounded-xl bg-surface-100-900/95 p-6 shadow-2xl backdrop-blur"
                                on:submit|preventDefault={createNewClass}
                        >
                                <div class="flex items-start justify-between gap-3">
                                        <div class="space-y-1">
                                                <h3 id="create-class-title" class="text-lg font-semibold">
                                                        Neue Klasse anlegen
                                                </h3>
                                                <p class="text-sm text-slate-500 dark:text-slate-300">
                                                        Benennen Sie die Klasse und importieren Sie vorhandene Daten oder fügen Sie eine Liste hinzu.
                                                </p>
                                        </div>
                                        <button
                                                class="btn btn-icon border border-transparent bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                                                type="button"
                                                aria-label="Erstellung abbrechen"
                                                on:click={closeCreateClassModal}
                                        >
                                                ✕
                                        </button>
                                </div>

                                <label class="flex flex-col gap-2">
                                        <span class="text-sm font-medium">Klassenname</span>
                                        <input
                                                class="input"
                                                type="text"
                                                bind:value={createClassName}
                                                placeholder="z. B. Mathematik 7A"
                                                on:input={() => (createClassError = '')}
                                        />
                                </label>

                                <div class="grid gap-4 md:grid-cols-2">
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">JSON importieren</span>
                                                <input
                                                        type="file"
                                                        accept="application/json"
                                                        on:change={(event) => handleCreateClassImport(event, 'json')}
                                                />
                                        </label>
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">CSV importieren</span>
                                                <input
                                                        type="file"
                                                        accept=".csv,text/csv"
                                                        on:change={(event) => handleCreateClassImport(event, 'csv')}
                                                />
                                        </label>
                                </div>

                                {#if createClassImportWarnings.length}
                                        <ul class="rounded-lg border border-warning-300/40 bg-warning-100/60 p-4 text-sm text-warning-900">
                                                {#each createClassImportWarnings as warning, index}
                                                        <li>{index + 1}. {warning}</li>
                                                {/each}
                                        </ul>
                                {/if}

                                <label class="flex flex-col gap-2">
                                        <span class="text-sm font-medium">Kommagetrennte Liste von Lernenden</span>
                                        <textarea
                                                class="textarea"
                                                rows={4}
                                                bind:value={createClassLearnerText}
                                                placeholder="Max Mustermann, Erika Musterfrau, …"
                                                on:input={() => (createClassError = '')}
                                        ></textarea>
                                        <span class="text-xs text-slate-500 dark:text-slate-300">
                                                Namen mit Kommas trennen. Bereits importierte Lernende bleiben erhalten.
                                        </span>
                                </label>

                                {#if importedLearnerDraft.length}
                                        <p class="rounded border border-slate-300/60 bg-slate-100/60 px-3 py-2 text-sm text-slate-700 dark:border-slate-600/70 dark:bg-surface-200-800/70 dark:text-slate-200">
                                                Bereits importiert: {importedLearnerDraft.length} Lernende.
                                        </p>
                                {/if}

                                {#if createClassError}
                                        <p class="rounded border border-error-300 bg-error-100 px-3 py-2 text-sm text-error-800">
                                                {createClassError}
                                        </p>
                                {/if}

                                <div class="flex justify-end gap-3">
                                        <button
                                                class="btn border border-slate-400 text-slate-700 hover:bg-slate-100"
                                                type="button"
                                                on:click={closeCreateClassModal}
                                        >
                                                Abbrechen
                                        </button>
                                        <button class="btn bg-sky-600 text-white hover:bg-sky-700" type="submit">
                                                Klasse erstellen
                                        </button>
                                </div>
                        </form>
                </div>
        {/if}

        {#if settingsOpen && activeLearner}
                <div
                        class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 px-4 py-6"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="learner-settings-title"
                        tabindex="-1"
                        on:keydown={handleOverlayKeydown}
                        on:click={handleOverlayClick}
                >
                        <div
                                class="w-full max-w-xl space-y-6 rounded-xl bg-surface-100-900/95 p-6 shadow-2xl backdrop-blur"
                        >
                                <div class="flex items-start justify-between gap-3">
                                        <div class="space-y-1">
                                                <h3 id="learner-settings-title" class="text-lg font-semibold">
                                                        Einstellungen für {activeLearner.name}
                                                </h3>
                                                <p class="text-sm text-slate-500 dark:text-slate-300">
                                                        Änderungen werden automatisch übernommen.
                                                </p>
                                        </div>
                                        <button
                                                class="btn btn-icon border border-transparent bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                                                type="button"
                                                aria-label="Einstellungsfenster schließen"
                                                on:click={closeLearnerSettings}
                                        >
                                                ✕
                                        </button>
                                </div>

                                <div class="grid gap-4">
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">Name</span>
                                                <input
                                                        class="input"
                                                        type="text"
                                                        value={activeLearner.name}
                                                        on:input={(event) =>
                                                                updateLearnerName(
                                                                        activeLearner.id,
                                                                        (event.currentTarget as HTMLInputElement).value
                                                                )
                                                        }
                                                />
                                        </label>
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">Leistungsniveau</span>
                                                <select
                                                        class="input"
                                                        value={activeLearner.performance}
                                                        on:change={(event) =>
                                                                handlePerformanceSelect(event, activeLearner.id)
                                                        }
                                                >
                                                        <option value="high">Leistungsstark</option>
                                                        <option value="medium">Ausgeglichen</option>
                                                        <option value="low">Unterstützend</option>
                                                </select>
                                        </label>
                                        <label class="flex flex-col gap-2">
                                                <span class="text-sm font-medium">Notiz (optional)</span>
                                                <textarea
                                                        class="textarea"
                                                        rows={3}
                                                        value={activeLearner.notes ?? ''}
                                                        on:input={(event) =>
                                                                updateLearnerNotes(
                                                                        activeLearner.id,
                                                                        (event.currentTarget as HTMLTextAreaElement).value
                                                                )
                                                        }
                                                ></textarea>
                                        </label>
                                        <div class="grid gap-4 md:grid-cols-3">
                                                <RelationshipSelector
                                                        label="Arbeitet gerne mit …"
                                                        selected={activeLearner.prefer}
                                                        options={availableRelationshipOptions}
                                                        placeholder="Namen suchen"
                                                        on:change={({ detail }) =>
                                                                updateLearnerRelationships(
                                                                        activeLearner.id,
                                                                        'prefer',
                                                                        detail.values
                                                                )
                                                        }
                                                />
                                                <RelationshipSelector
                                                        label="Soll getrennt werden von …"
                                                        selected={activeLearner.avoid}
                                                        options={availableRelationshipOptions}
                                                        placeholder="Namen suchen"
                                                        on:change={({ detail }) =>
                                                                updateLearnerRelationships(
                                                                        activeLearner.id,
                                                                        'avoid',
                                                                        detail.values
                                                                )
                                                        }
                                                />
                                                <RelationshipSelector
                                                        label="Nie in Gruppe mit …"
                                                        selected={activeLearner.never}
                                                        options={availableRelationshipOptions}
                                                        placeholder="Namen suchen"
                                                        on:change={({ detail }) =>
                                                                updateLearnerRelationships(
                                                                        activeLearner.id,
                                                                        'never',
                                                                        detail.values
                                                                )
                                                        }
                                                />
                                        </div>
                                </div>

                                <div class="flex justify-end">
                                        <button
                                                class="btn bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                                                type="button"
                                                on:click={closeLearnerSettings}
                                        >
                                                Schließen
                                        </button>
                                </div>
                        </div>
                </div>
        {/if}
</main>
