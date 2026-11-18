import {
  ENGINE_STAGE_SPECS,
  PAINT_PRESETS,
  UNDERGLOW_COLORS,
  VEHICLE_CATALOG,
  type BodyKitId,
  type EngineStageId,
  type PaintPresetId,
  type StanceId,
  type TuningConfig,
  type UnderglowColorId,
  type VehicleModelId,
  type WheelStyleId,
} from '../vehicles/VehicleConfig';

export interface GarageUIOptions {
  readonly container: HTMLElement;
  readonly initialTuning: TuningConfig;
  readonly onTuningChange: (tuning: TuningConfig) => void;
  readonly onClose: () => void;
}

interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/**
 * Panel interactivo de Garaje y Tuning en vivo para elegir vehículos (Nissan, Audi,
 * Mercedes-Benz, Concept GT) y personalizar pintura, kit aerodinámico, rines,
 * neón inferior, stage de motor y suspensión.
 */
export class GarageUI {
  private readonly root: HTMLElement;
  private readonly onTuningChange: (tuning: TuningConfig) => void;
  private readonly onClose: () => void;
  private paintSelectEl: HTMLSelectElement | null = null;
  private tuning: TuningConfig;
  private isOpen = false;

  public constructor(options: GarageUIOptions) {
    this.onTuningChange = options.onTuningChange;
    this.onClose = options.onClose;
    this.tuning = options.initialTuning;

    this.root = document.createElement('aside');
    this.root.className = 'garage-drawer';
    this.root.setAttribute('aria-label', 'Garaje de personalización y tuning');
    this.root.hidden = true;

    this.render();
    options.container.append(this.root);
  }

  public isVisible(): boolean {
    return this.isOpen;
  }

  public setOpen(open: boolean): void {
    this.isOpen = open;
    this.root.hidden = !open;
  }

  public toggle(): boolean {
    this.setOpen(!this.isOpen);
    return this.isOpen;
  }

  public dispose(): void {
    this.root.remove();
  }

  private updateField<K extends keyof TuningConfig>(key: K, value: TuningConfig[K]): void {
    if (key === 'vehicleId') {
      const vehicleId = value as VehicleModelId;
      const defaultPaint = VEHICLE_CATALOG[vehicleId].defaultPaint;
      this.tuning = { ...this.tuning, vehicleId, paintPreset: defaultPaint };
      if (this.paintSelectEl) {
        this.paintSelectEl.value = defaultPaint;
      }
    } else {
      this.tuning = { ...this.tuning, [key]: value };
    }
    this.onTuningChange(this.tuning);
  }

  private render(): void {
    this.root.replaceChildren();

    const header = document.createElement('div');
    header.className = 'garage-header';

    const title = document.createElement('h2');
    title.className = 'garage-title';
    title.textContent = 'Garaje & Tuning CDMX';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hud-action-btn';
    closeBtn.textContent = 'Cerrar (G)';
    closeBtn.addEventListener('click', () => {
      this.setOpen(false);
      this.onClose();
    });

    header.append(title, closeBtn);

    const form = document.createElement('div');
    form.className = 'garage-controls';

    const vehicleOptions: SelectOption<VehicleModelId>[] = (
      Object.keys(VEHICLE_CATALOG) as VehicleModelId[]
    ).map((id) => ({
      value: id,
      label: VEHICLE_CATALOG[id].label,
    }));

    const paintRow = this.createSelectRow<PaintPresetId>(
      'tune-paint',
      'Pintura / Livery',
      Object.values(PAINT_PRESETS).map((p) => ({ value: p.id, label: p.label })),
      this.tuning.paintPreset,
      (v) => this.updateField('paintPreset', v),
    );
    this.paintSelectEl = paintRow.select;

    form.append(
      this.createSelectRow<VehicleModelId>(
        'tune-vehicle',
        'Vehículo (Nissan / Audi / Mercedes)',
        vehicleOptions,
        this.tuning.vehicleId,
        (v) => this.updateField('vehicleId', v),
      ).row,
      paintRow.row,
      this.createSelectRow<BodyKitId>(
        'tune-kit',
        'Kit Aerodinámico',
        [
          { value: 'STOCK', label: 'Original de Agencia' },
          { value: 'STREET_TUNER', label: 'Street Tuner (Lip + Faldones)' },
          { value: 'MIDNIGHT_GT', label: 'Midnight GT (Alerón Carbono)' },
        ],
        this.tuning.bodyKit,
        (v) => this.updateField('bodyKit', v),
      ).row,
      this.createSelectRow<WheelStyleId>(
        'tune-wheels',
        'Rines / Tapones',
        [
          { value: 'TAPONES_STOCK', label: 'Tapones Plata Agencia' },
          { value: 'BBS_GOLD', label: 'Rines Deportivos Dorados' },
          { value: 'CHROME_SPORT', label: 'Rines Cromo Deportivo' },
        ],
        this.tuning.wheelStyle,
        (v) => this.updateField('wheelStyle', v),
      ).row,
      this.createSelectRow<UnderglowColorId>(
        'tune-underglow',
        'Neón Inferior',
        (Object.keys(UNDERGLOW_COLORS) as UnderglowColorId[]).map((id) => ({
          value: id,
          label: UNDERGLOW_COLORS[id].label,
        })),
        this.tuning.underglow,
        (v) => this.updateField('underglow', v),
      ).row,
      this.createSelectRow<EngineStageId>(
        'tune-engine',
        'Motor / Turbo',
        (Object.keys(ENGINE_STAGE_SPECS) as EngineStageId[]).map((id) => ({
          value: id,
          label: ENGINE_STAGE_SPECS[id].label,
        })),
        this.tuning.engineStage,
        (v) => this.updateField('engineStage', v),
      ).row,
      this.createSelectRow<StanceId>(
        'tune-stance',
        'Suspensión / Stance',
        [
          { value: 'STOCK', label: 'Altura Original' },
          { value: 'LOWERED', label: 'Achaparrado (-45 mm)' },
          { value: 'DRIFT_SPEC', label: 'Drift Spec (+Camber)' },
        ],
        this.tuning.stance,
        (v) => this.updateField('stance', v),
      ).row,
    );

    this.root.append(header, form);
  }

  private createSelectRow<T extends string>(
    id: string,
    labelText: string,
    options: readonly SelectOption<T>[],
    selectedValue: T,
    onChange: (value: T) => void,
  ): { row: HTMLElement; select: HTMLSelectElement } {
    const row = document.createElement('div');
    row.className = 'garage-field';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;

    const select = document.createElement('select');
    select.id = id;
    select.className = 'garage-select';

    for (const opt of options) {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      optionEl.selected = opt.value === selectedValue;
      select.append(optionEl);
    }

    select.addEventListener('change', () => {
      onChange(select.value as T);
    });

    row.append(label, select);
    return { row, select };
  }
}
