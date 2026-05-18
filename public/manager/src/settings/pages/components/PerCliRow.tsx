// Phase 2 — single CLI row (model + effort + fastMode).

import { TextField, SelectField, ToggleField } from '../../fields';
import type { DirtyEntry } from '../../types';
import type { CliMeta, PerCliEntry } from './agent/agent-meta';

type Props = {
    cli: string;
    meta: CliMeta;
    original: PerCliEntry;
    value: PerCliEntry;
    setValue: (next: PerCliEntry) => void;
    setEntry: (key: string, entry: DirtyEntry) => void;
};

function entryFor(value: unknown, original: unknown, valid = true): DirtyEntry {
    return { value, original, valid };
}

export function PerCliRow({ cli, meta, original, value, setValue, setEntry }: Props) {
    const modelDatalistId = `percli-${cli}-models`;
    const isAiE = cli === 'ai-e';
    const provider = value.provider || meta.defaultProvider || meta.providers?.[0] || 'claude';
    const modelOptions = isAiE
        ? (meta.modelsByProvider?.[provider] ?? meta.models)
        : meta.models;
    const effortOptions = isAiE
        ? (meta.effortsByProvider?.[provider] ?? meta.efforts)
        : meta.efforts;

    return (
        <div className="settings-percli-row" data-cli={cli}>
            <h3 className="settings-percli-title">{meta.label}</h3>
            <div className="settings-percli-grid">
                {isAiE && meta.providers?.length ? (
                    <SelectField
                        id={`percli-${cli}-provider`}
                        label="Provider"
                        value={provider}
                        options={meta.providers.map((p) => ({ value: p, label: p }))}
                        onChange={(next) => {
                            const nextModels = meta.modelsByProvider?.[next] ?? [];
                            const nextEfforts = meta.effortsByProvider?.[next] ?? [];
                            const nextModel = nextModels.includes(value.model || '') ? (value.model || '') : (nextModels[0] || '');
                            const nextEffort = nextEfforts.includes(value.effort || '') ? (value.effort || '') : '';
                            setValue({ ...value, provider: next, model: nextModel, effort: nextEffort });
                            setEntry(`perCli.${cli}.provider`, entryFor(next, original.provider ?? meta.defaultProvider ?? 'claude'));
                            setEntry(`perCli.${cli}.model`, entryFor(nextModel, original.model ?? ''));
                            setEntry(`perCli.${cli}.effort`, entryFor(nextEffort, original.effort ?? ''));
                        }}
                    />
                ) : null}
                <div className="settings-percli-model">
                    <TextField
                        id={`percli-${cli}-model`}
                        label="Model"
                        value={value.model ?? ''}
                        onChange={(next) => {
                            setValue({ ...value, model: next });
                            setEntry(`perCli.${cli}.model`, entryFor(next, original.model ?? ''));
                        }}
                        placeholder={modelOptions[0] ?? 'model id'}
                    />
                    {modelOptions.length > 0 ? (
                        <datalist id={modelDatalistId}>
                            {modelOptions.map((m) => (
                                <option key={m} value={m} />
                            ))}
                        </datalist>
                    ) : null}
                </div>
                {effortOptions.length > 0 ? (
                    <SelectField
                        id={`percli-${cli}-effort`}
                        label="Effort"
                        value={value.effort ?? ''}
                        options={[
                            { value: '', label: '(default)' },
                            ...effortOptions.map((e) => ({ value: e, label: e })),
                        ]}
                        onChange={(next) => {
                            setValue({ ...value, effort: next });
                            setEntry(`perCli.${cli}.effort`, entryFor(next, original.effort ?? ''));
                        }}
                    />
                ) : null}
                <ToggleField
                    id={`percli-${cli}-fastmode`}
                    label="Fast mode"
                    value={Boolean(value.fastMode)}
                    onChange={(next) => {
                        setValue({ ...value, fastMode: next });
                        setEntry(`perCli.${cli}.fastMode`, entryFor(next, Boolean(original.fastMode)));
                    }}
                />
            </div>
        </div>
    );
}
