import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "selectable-avatar",
  template: `<span
    [title]="title"
    (click)="onFire()"
    (keyup.enter)="onFire()"
    (keyup.space)="onFire()"
    tabindex="0"
    [ngClass]="classList"
  >
    <bit-avatar
      appStopClick
      [text]="text"
      size="xlarge"
      [text]="text"
      [color]="color"
      [border]="false"
      [id]="id"
      [icon]="icon"
      [border]="border"
      [title]="title"
    >
    </bit-avatar>
  </span>`,
})
export class SelectableAvatarComponent {
  @Input() id: number;
  @Input() text: string;
  @Input() icon: string;
  @Input() title: string;
  @Input() color: string;
  @Input() border = false;
  @Input() selected = false;
  @Output() select = new EventEmitter<string>();

  onFire() {
    this.select.emit(this.color);
  }

  get classList() {
    return ["tw-rounded-full tw-inline-block"]
      .concat(["tw-cursor-pointer", "tw-outline", "tw-outline-solid", "tw-outline-offset-1"])
      .concat(
        this.selected
          ? ["tw-outline-[3px]", "tw-outline-primary-500"]
          : [
              "tw-outline-0",
              "hover:tw-outline-1",
              "hover:tw-outline-primary-300",
              "focus:tw-outline-2",
              "focus:tw-outline-primary-500",
            ]
      );
  }
}
