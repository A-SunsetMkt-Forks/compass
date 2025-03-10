import type { CompassBrowser } from '../compass-browser';
import * as Selectors from '../selectors';

export async function setValidation(
  browser: CompassBrowser,
  value: string
): Promise<void> {
  await browser.setCodemirrorEditorValue(Selectors.ValidationEditor, value);

  // it should eventually detect that the text changed
  const validationActionMessageElement = browser.$(
    Selectors.ValidationActionMessage
  );
  await validationActionMessageElement.waitForDisplayed();

  await browser.clickVisible(Selectors.UpdateValidationButton);

  // Confirm in the confirmation modal.
  await browser.clickVisible(Selectors.confirmationModalConfirmButton());

  // Close toast.
  await browser.clickVisible(
    Selectors.closeToastButton(Selectors.ValidationSuccessToast)
  );

  // both buttons should become hidden if it succeeds
  await validationActionMessageElement.waitForDisplayed({
    reverse: true,
  });

  const updateValidationButtonElement = browser.$(
    Selectors.UpdateValidationButton
  );
  await updateValidationButtonElement.waitForDisplayed({
    reverse: true,
  });

  // wait a bit because the buttons that will update the documents are
  // debounce-rerendered and if we act on them too fast then they will be
  // replaced
  await browser.pause(2000);
}
