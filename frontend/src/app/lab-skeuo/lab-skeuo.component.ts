import { Component } from '@angular/core';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { PlaquetaComponent } from './plaqueta/plaqueta.component';
import { ViaOsComponent } from './via-os/via-os.component';
import { ManometroComponent } from './manometro/manometro.component';
import { EtiquetaPreventivaComponent } from './etiqueta-preventiva/etiqueta-preventiva.component';

/**
 * Tela de teste (fora do menu e sem login): reúne as peças de skeuomorfismo
 * candidatas, cada uma num card que diz em que tela entraria e por quê.
 * Nada daqui está ligado aos dados reais.
 */
@Component({
  selector: 'app-lab-skeuo',
  standalone: true,
  imports: [ThemeToggleComponent, PlaquetaComponent, ViaOsComponent, ManometroComponent, EtiquetaPreventivaComponent],
  templateUrl: './lab-skeuo.component.html',
  styleUrl: './lab-skeuo.component.scss'
})
export class LabSkeuoComponent {}
