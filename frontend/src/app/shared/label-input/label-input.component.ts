import { Component, Input, booleanAttribute, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconComponent } from '../icon/icon.component';

let nextId = 0;

// Adaptado de "Label Input" (spell.sh/docs/label-input): o original usa
// Tailwind (peer-placeholder-shown/peer-focus) para flutuar o label via
// CSS puro. Aqui a mesma técnica é replicada com :placeholder-shown/:focus
// e os tokens de cor/raio já usados no resto do app, e o componente vira um
// ControlValueAccessor pra funcionar com [(ngModel)] como um input nativo
// (inclusive #ctrl="ngModel" no template do formulário).
export type LabelInputType = 'text' | 'email' | 'password' | 'tel' | 'search';

@Component({
  selector: 'app-label-input',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './label-input.component.html',
  styleUrl: './label-input.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LabelInputComponent),
      multi: true
    }
  ]
})
export class LabelInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() type: LabelInputType = 'text';
  // Espaço em branco garante que :placeholder-shown dispare mesmo quando o
  // chamador não passa um placeholder próprio (o texto nunca aparece, pois
  // a cor fica transparente até o campo receber foco).
  @Input() placeholder = ' ';
  @Input() autocomplete = 'off';
  @Input({ transform: booleanAttribute }) required = false;
  @Input({ transform: booleanAttribute }) spellcheckOn = true;

  readonly inputId = `label-input-${nextId++}`;

  value = '';
  disabled = false;
  visible = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  get isPassword(): boolean {
    return this.type === 'password';
  }

  get currentType(): string {
    return this.isPassword ? (this.visible() ? 'text' : 'password') : this.type;
  }

  toggleVisibility(): void {
    this.visible.set(!this.visible());
  }

  onInput(event: Event): void {
    this.value = (event.target as HTMLInputElement).value;
    this.onChange(this.value);
  }

  onBlur(): void {
    this.onTouched();
  }

  writeValue(value: string): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
