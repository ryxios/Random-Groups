<script lang="ts">
        import { createEventDispatcher } from 'svelte';

        type Option = {
                id: string;
                name: string;
        };

        const dispatch = createEventDispatcher<{ change: { values: string[] } }>();

        export let label: string;
        export let selected: string[] = [];
        export let options: Option[] = [];
        export let placeholder = 'Suchen …';
        export let disabled = false;

        let query = '';
        let focused = false;

        $: normalizedSelected = selected.filter(Boolean);
        $: optionMap = new Map(options.map((entry) => [entry.id, entry]));
        $: selectedOptions = normalizedSelected
                .map((id) => optionMap.get(id) ?? { id, name: 'Unbekannt' })
                .filter((entry, index, array) => array.findIndex((item) => item.id === entry.id) === index);

        $: filteredOptions = options
                .filter((entry) => !normalizedSelected.includes(entry.id))
                .filter((entry) =>
                        query.trim()
                                ? entry.name.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de'))
                                : true
                )
                .slice(0, 12);

        $: showList = focused && filteredOptions.length > 0;

        function selectOption(id: string) {
                if (normalizedSelected.includes(id)) return;
                dispatch('change', { values: [...normalizedSelected, id] });
                query = '';
        }

        function removeSelection(id: string) {
                dispatch('change', { values: normalizedSelected.filter((value) => value !== id) });
        }

        function handleKeydown(event: KeyboardEvent) {
                if (event.key === 'Enter' && filteredOptions[0]) {
                        event.preventDefault();
                        selectOption(filteredOptions[0].id);
                } else if (event.key === 'Backspace' && !query && normalizedSelected.length) {
                        event.preventDefault();
                        const last = normalizedSelected[normalizedSelected.length - 1];
                        removeSelection(last);
                }
        }
</script>

<div class="space-y-2">
        <span class="text-sm font-medium">{label}</span>
        <div class="relative">
                <input
                        class="input pr-10"
                        type="search"
                        placeholder={placeholder}
                        bind:value={query}
                        {disabled}
                        on:focus={() => (focused = true)}
                        on:blur={() => (focused = false)}
                        on:keydown={handleKeydown}
                        aria-label={label}
                        aria-autocomplete="list"
                />
                <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                        🔍
                </span>
                {#if showList}
                        <ul class="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700/80 dark:bg-surface-200-800/95">
                                {#each filteredOptions as option (option.id)}
                                        <li>
                                                <button
                                                        class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:hover:bg-slate-700/70 dark:focus:bg-slate-700/70"
                                                        type="button"
                                                        on:mousedown|preventDefault={() => selectOption(option.id)}
                                                >
                                                        {option.name}
                                                </button>
                                        </li>
                                {/each}
                        </ul>
                {/if}
        </div>
        {#if selectedOptions.length}
                <ul class="flex flex-wrap gap-2 text-xs">
                        {#each selectedOptions as option (option.id)}
                                <li>
                                        <span class="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-700/70">
                                                <span>{option.name}</span>
                                                <button
                                                        class="text-slate-500 hover:text-rose-600 focus:text-rose-600 focus:outline-none"
                                                        type="button"
                                                        on:click={() => removeSelection(option.id)}
                                                        aria-label={`${option.name} entfernen`}
                                                >
                                                        ✕
                                                </button>
                                        </span>
                                </li>
                        {/each}
                </ul>
        {:else}
                <p class="text-xs text-slate-500 dark:text-slate-400">Noch keine Auswahl.</p>
        {/if}
</div>
