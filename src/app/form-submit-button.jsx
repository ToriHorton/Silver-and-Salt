import { useLayoutEffect, useRef, useState } from "preact/hooks";

/** Keep the visible submit state aligned with the form's current native constraints. */
export function FormSubmitButton({ disabled = false, children, ...props }) {
  const button = useRef(null);
  const [complete, setComplete] = useState(false);
  useLayoutEffect(() => {
    const form = button.current?.form;
    if (!form) return;
    let live = true;
    const update = () => {
      if (!live) return;
      setComplete(Array.from(form.elements).every(field => !field.willValidate ||
        (field.validity.valid && (!field.required || String(field.value).trim().length > 0))));
    };
    // Conditional fields finish rendering after their input/change handler.
    const afterInput = () => queueMicrotask(update);
    update();
    form.addEventListener("input", afterInput);
    form.addEventListener("change", afterInput);
    form.addEventListener("focusin", afterInput);
    return () => {
      live = false;
      form.removeEventListener("input", afterInput);
      form.removeEventListener("change", afterInput);
      form.removeEventListener("focusin", afterInput);
    };
  });
  return <button {...props} ref={button} class="submit-btn" type="submit" disabled={disabled || !complete}>{children}</button>;
}
