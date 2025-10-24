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
                result = null;
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

        function updateLearners() {
                learners = learners.map((entry) => ({ ...entry }));
                resetResult();
        }

        function handleRelationshipChange() {
                updateLearners();
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
                                <button class="btn bg-sky-600 text-white hover:bg-sky-700" type="button" on:click={handleSave}
                                        >Speichern</button
                                >
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
                        <div class="grid gap-4 md:grid-cols-2">
                                {#each learners as learner (learner.id)}
                                        <article class="card flex flex-col gap-3">
                                                <div class="flex items-start justify-between gap-2">
                                                        <div class="flex-1 space-y-2">
                                                                <input
                                                                        class="input"
                                                                        type="text"
                                                                        bind:value={learner.name}
                                                                        on:input={updateLearners}
                                                                        placeholder="Name"
                                                                />
                                                                <select
                                                                        class="input"
                                                                        bind:value={learner.performance}
                                                                        on:change={updateLearners}
                                                                >
                                                                        <option value="high">Leistungsstark</option>
                                                                        <option value="medium">Ausgeglichen</option>
                                                                        <option value="low">Unterstützend</option>
                                                                </select>
                                                                <textarea
                                                                        class="textarea"
                                                                        rows={2}
                                                                        bind:value={learner.notes}
                                                                        on:input={updateLearners}
                                                                        placeholder="Bemerkungen"
                                                                ></textarea>
                                                        </div>
                                                        <button
                                                                class="btn btn-icon border border-transparent bg-rose-600 text-white hover:bg-rose-700"
                                                                type="button"
                                                                aria-label="Lernende entfernen"
                                                                on:click={() => removeLearner(learner.id)}
                                                        >
                                                                ✕
                                                        </button>
                                                </div>
                                                <div class="grid gap-3 md:grid-cols-2">
                                                        <label class="flex flex-col gap-1 text-sm">
                                                                <span class="font-medium">Arbeitet gerne mit …</span>
                                                                <select
                                                                        class="input min-h-[6rem]"
                                                                        multiple
                                                                        bind:value={learner.prefer}
                                                                        on:change={handleRelationshipChange}
                                                                >
                                                                        {#each learners as other (other.id)}
                                                                                {#if other.id !== learner.id}
                                                                                        <option value={other.id}>{other.name}</option>
                                                                                {/if}
                                                                        {/each}
                                                                </select>
                                                        </label>
                                                        <label class="flex flex-col gap-1 text-sm">
                                                                <span class="font-medium">Soll getrennt werden von …</span>
                                                                <select
                                                                        class="input min-h-[6rem]"
                                                                        multiple
                                                                        bind:value={learner.avoid}
                                                                        on:change={handleRelationshipChange}
                                                                >
                                                                        {#each learners as other (other.id)}
                                                                                {#if other.id !== learner.id}
                                                                                        <option value={other.id}>{other.name}</option>
                                                                                {/if}
                                                                        {/each}
                                                                </select>
                                                        </label>
                                                </div>
                                                <p class="text-xs opacity-60">
                                                        {performanceLabel(learner.performance)} · {learner.prefer.length} Wunschkontakte · {learner.avoid.length}
                                                        Trennungen
                                                </p>
                                        </article>
                                {/each}
                        </div>
                {/if}
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
</main>
