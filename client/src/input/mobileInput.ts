export const mobileInput = {
  left: false,
  right: false,
  jump: false,
  attack: false,
};

export function bindMobileButton(id: string, key: keyof typeof mobileInput) {
  const button = document.getElementById(id);

  if (!button) return;

  const press = (event: Event) => {
    event.preventDefault();
    mobileInput[key] = true;
  };

  const release = (event: Event) => {
    event.preventDefault();
    mobileInput[key] = false;
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}

export function setupMobileInput() {
  bindMobileButton("btn-left", "left");
  bindMobileButton("btn-right", "right");
  bindMobileButton("btn-jump", "jump");
  bindMobileButton("btn-attack", "attack");
}
