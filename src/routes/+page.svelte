<script lang="ts">
        import { browser } from '$app/environment';
        import { onMount } from 'svelte';
        import type { GroupingConfig, GroupingResult, LearnerRecord, StoredClass } from '$lib/types';
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
        let importMessages: string[] = [];
        let errorMessage = '';

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

        $: activeLearner =
                activeLearnerId ? learners.find((entry) => entry.id === activeLearnerId) ?? null : null;

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
                if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        closeLearnerSettings();
                }
        }

        function handleOverlayClick(event: MouseEvent) {
                if (event.target === event.currentTarget) {
                        closeLearnerSettings();
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
                                avoid: entry.avoid.filter((ref) => ref !== id)
                        }));
                resetResult();
        }

        function handlePerformanceSelect(event: Event, learnerId: string) {
                const target = event.currentTarget as HTMLSelectElement | null;
                if (!target) return;
                updateLearnerPerformance(learnerId, target.value as LearnerRecord['performance']);
        }

        function handleRelationshipChange(
                learnerId: string,
                kind: 'prefer' | 'avoid',
                event: Event
        ) {
                const target = event.currentTarget as HTMLSelectElement | null;
                if (!target) return;

                const selected = Array.from(target.selectedOptions, (option) => option.value);
                learners = learners.map((entry) =>
                        entry.id === learnerId ? { ...entry, [kind]: selected } : entry
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
                importMessages = [];
                worker.postMessage({ learners, config });
        }

        async function handleImport(event: Event, type: 'csv' | 'json') {
                const input = event.currentTarget as HTMLInputElement;
                const files = input?.files;
                if (!files || !files[0]) return;
                const file = files[0];

                try {
                        const result =
                                type === 'json' ? await importFromJson(file) : await importFromCsv(file);
                        learners = result.data.learners;
                        importMessages = result.warnings;
                        errorMessage = '';
                        resetResult();
                } catch (error) {
                        errorMessage =
                                error instanceof Error ? error.message : 'Import fehlgeschlagen. Bitte prüfen Sie die Datei.';
                }

                if (input) {
                        input.value = '';
                }
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

        async function handleSaveAs() {
                currentClassId = null;
                await handleSave();
        }

        async function handleLoad() {
                if (!browser || !selectedStoredClass) return;
                const stored = await loadClass(selectedStoredClass);
                if (!stored) return;
                learners = stored.data.learners;
                className = stored.name;
                currentClassId = stored.id;
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
</script>

<svelte:window on:keydown={handleSettingsKeydown} />

<svelte:head>
        <title>Zufällige Lerngruppen</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <header class="flex flex-col gap-4 rounded-xl bg-surface-200-800/70 p-6 shadow-lg">
                <h1 class="text-3xl font-semibold">Zufällige Lerngruppen planen</h1>
                <p class="text-base opacity-80">
                        Erstellen Sie ausgewogene Gruppen basierend auf Teamregeln, Leistungsniveaus und persönlichen Präferenzen.
                        Im- und Export, lokale Speicherung und Offline-Unterstützung sind integriert.
                </p>
        </header>

        <section class="grid gap-6 rounded-xl bg-surface-100-900/60 p-6 shadow">
                <h2 class="text-xl font-semibold">Klassenverwaltung</h2>
                <div class="grid gap-4 md:grid-cols-2">
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
                        <div class="flex items-end gap-3">
                                <button
                                        class="btn border border-sky-600 text-sky-700 hover:bg-sky-50"
                                        type="button"
                                        on:click={handleSaveAs}
                                >
                                        Speichern als …
                                </button>
                        </div>
                </div>
                <div class="grid gap-4 md:grid-cols-[2fr_1fr]">
                        <label class="flex flex-col gap-2">
                                <span class="text-sm font-medium">Gespeicherte Klasse laden</span>
                                <select class="input" bind:value={selectedStoredClass}>
                                        <option value="">– Auswahl –</option>
                                        {#each savedClasses as stored (stored.id)}
                                                <option value={stored.id}>{stored.name}</option>
                                        {/each}
                                </select>
                        </label>
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
        </section>

        <section class="grid gap-6 rounded-xl bg-surface-100-900/60 p-6 shadow">
                <h2 class="text-xl font-semibold">Daten importieren &amp; exportieren</h2>
                <div class="grid gap-4 md:grid-cols-2">
                        <label class="flex flex-col gap-2">
                                <span class="text-sm font-medium">JSON importieren</span>
                                <input
                                        type="file"
                                        accept="application/json"
                                        on:change={(event) => handleImport(event, 'json')}
                                />
                        </label>
                        <label class="flex flex-col gap-2">
                                <span class="text-sm font-medium">CSV importieren</span>
                                <input
                                        type="file"
                                        accept=".csv,text/csv"
                                        on:change={(event) => handleImport(event, 'csv')}
                                />
                        </label>
                </div>
                <div class="flex flex-wrap gap-3">
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
                {#if importMessages.length}
                        <ul class="rounded-lg border border-warning-300/40 bg-warning-100/60 p-4 text-sm text-warning-900">
                                {#each importMessages as message, index}
                                        <li>{index + 1}. {message}</li>
                                {/each}
                        </ul>
                {/if}
        </section>

        <section class="grid gap-6 rounded-xl bg-surface-100-900/60 p-6 shadow">
                <h2 class="text-xl font-semibold">Lernende verwalten</h2>
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
                                                                {performanceLabel(learner.performance)} · {learner.prefer.length} Wunschkontakte · {learner.avoid.length} Trennungen
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
        </section>

        <section class="grid gap-6 rounded-xl bg-surface-100-900/60 p-6 shadow">
                <button
                        class="btn self-start bg-sky-600 text-white hover:bg-sky-700"
                        type="button"
                        on:click={handleSave}
                >
                        Speichern
                </button>
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
                                                                        <div class="text-xs opacity-70">
                                                                                {performanceLabel(member.performance)}
                                                                                {#if member.notes}
                                                                                        · {member.notes}
                                                                                {/if}
                                                                        </div>
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
                        {#if result.issues.length}
                                <div class="space-y-2">
                                        <h3 class="text-lg font-semibold">Hinweise</h3>
                                        {#each result.issues as issue, index}
                                                <div
                                                        class={`rounded-lg border px-3 py-2 text-sm ${
                                                                issue.type === 'conflict'
                                                                        ? 'border-error-400/60 bg-error-100/50 text-error-900'
                                                                        : 'border-warning-400/60 bg-warning-100/50 text-warning-900'
                                                        }`}
                                                >
                                                        {index + 1}. {issue.message}
                                                </div>
                                        {/each}
                                </div>
                        {/if}
                </section>
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
                                        <div class="grid gap-4 md:grid-cols-2">
                                                <label class="flex flex-col gap-2 text-sm">
                                                        <span class="font-medium">Arbeitet gerne mit …</span>
                                                        <select
                                                                class="input min-h-[8rem]"
                                                                multiple
                                                                on:change={(event) =>
                                                                        handleRelationshipChange(activeLearner.id, 'prefer', event)
                                                                }
                                                        >
                                                                {#each sortedLearners as other (other.id)}
                                                                        {#if other.id !== activeLearner.id}
                                                                                <option
                                                                                        value={other.id}
                                                                                        selected={activeLearner.prefer.includes(other.id)}
                                                                                >
                                                                                        {other.name}
                                                                                </option>
                                                                        {/if}
                                                                {/each}
                                                        </select>
                                                </label>
                                                <label class="flex flex-col gap-2 text-sm">
                                                        <span class="font-medium">Soll getrennt werden von …</span>
                                                        <select
                                                                class="input min-h-[8rem]"
                                                                multiple
                                                                on:change={(event) =>
                                                                        handleRelationshipChange(activeLearner.id, 'avoid', event)
                                                                }
                                                        >
                                                                {#each sortedLearners as other (other.id)}
                                                                        {#if other.id !== activeLearner.id}
                                                                                <option
                                                                                        value={other.id}
                                                                                        selected={activeLearner.avoid.includes(other.id)}
                                                                                >
                                                                                        {other.name}
                                                                                </option>
                                                                        {/if}
                                                                {/each}
                                                        </select>
                                                </label>
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
