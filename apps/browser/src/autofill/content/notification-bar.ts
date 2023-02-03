import AddLoginRuntimeMessage from "../../background/models/addLoginRuntimeMessage";
import ChangePasswordRuntimeMessage from "../../background/models/changePasswordRuntimeMessage";

/**
 * @fileoverview This file contains the code for the Bitwarden Notification Bar
 * The notification bar is used to notify logged in users that they can
 * save a new login, change a existing password on a password change screen,
 * or update an existing login after detecting a different password on login.
 */

/*
 * Run content script when the DOM is fully loaded
 *
 * The DOMContentLoaded event fires when the HTML document has been completely parsed,
 * and all deferred scripts (<script defer src="…"> and <script type="module">) have
 * downloaded and executed. It doesn't wait for other things like images, subframes,
 * and async scripts to finish loading.
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/DOMContentLoaded_event
 */

// TODO: Recommendations:
// (1) Move small helper functions into a separate file and import them to reduce the size of this file.

// TODO: How long does it take to execute full getPageDetails process to be ready to open the notification bar?
// i.e., Investigate if nested setTimeouts are causing issues in terms of missing form inputs

document.addEventListener("DOMContentLoaded", (event) => {
  // Do not show the notification bar on the Bitwarden vault
  // because they can add logins and change passwords there
  if (window.location.hostname.endsWith("vault.bitwarden.com")) {
    return;
  }

  // Initialize required variables and set default values
  const pageDetails: any[] = [];
  const formData: any[] = [];
  let barType: string = null;
  let pageHref: string = null;

  // Provides the ability to watch for changes being made to the DOM tree.
  let observer: MutationObserver = null;
  const observeIgnoredElements = new Set([
    "a",
    "i",
    "b",
    "strong",
    "span",
    "code",
    "br",
    "img",
    "small",
    "em",
    "hr",
  ]);
  let domObservationCollectTimeout: number = null;
  let collectIfNeededTimeout: number = null;
  let observeDomTimeout: number = null;
  const inIframe = isInIframe();
  const cancelButtonNames = new Set(["cancel", "close", "back"]);
  const logInButtonNames = new Set([
    "log in",
    "sign in",
    "login",
    "go",
    "submit",
    "continue",
    "next",
  ]);
  const changePasswordButtonNames = new Set([
    "save password",
    "update password",
    "change password",
    "change",
  ]);
  const changePasswordButtonContainsNames = new Set(["pass", "change", "contras", "senha"]);
  let disabledAddLoginNotification = false;
  let disabledChangedPasswordNotification = false;

  // Look up the active user id from storage
  const activeUserIdKey = "activeUserId";
  let activeUserId: string;
  chrome.storage.local.get(activeUserIdKey, (obj: any) => {
    if (obj == null || obj[activeUserIdKey] == null) {
      return;
    }
    activeUserId = obj[activeUserIdKey];
  });

  // Look up the user's settings from storage
  chrome.storage.local.get(activeUserId, (obj: any) => {
    if (obj?.[activeUserId] == null) {
      return;
    }

    const userSettings = obj[activeUserId].settings;

    // NeverDomains is a dictionary of domains that the user has chosen to never
    // show the notification bar on (for login detail collection or password change).
    // It is managed in the Settings > Excluded Domains page in the browser extension.
    // Example: '{"bitwarden.com":null}'
    const excludedDomainsDict = userSettings.neverDomains;

    if (
      excludedDomainsDict != null &&
      // eslint-disable-next-line
      excludedDomainsDict.hasOwnProperty(window.location.hostname)
    ) {
      return;
    }

    // Set preferences for whether to show the notification bar based on the user's settings
    // These are set in the Settings > Options page in the browser extension.
    disabledAddLoginNotification = userSettings.disableAddLoginNotification;
    disabledChangedPasswordNotification = userSettings.disableChangedPasswordNotification;

    if (!disabledAddLoginNotification || !disabledChangedPasswordNotification) {
      // If the user has not disabled both notifications, then collect the page details after a timeout
      // The timeout is used to allow more time for the page to load before collecting the page details
      // as there are some cases where SPAs do not load the entire page on initial load, so we need to wait
      collectPageDetailsIfNeededWithTimeout();
    }
  });

  //#region Message Processing

  // Listen for messages from the background script
  // Note: onMessage events are fired when a message is sent from either an extension process
  // (by runtime.sendMessage) or a content script (by tabs.sendMessage).
  // https://developer.chrome.com/docs/extensions/reference/runtime/#event-onMessage
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    processMessages(msg, sendResponse);
  });

  /**
   * Processes messages received from the background script via the `chrome.runtime.onMessage` event.
   * @param {Object} msg - The received message.
   * @param {Function} sendResponse - The function used to send a response back to the background script.
   * @returns {boolean} - Returns `true` if a response was sent, `false` otherwise.
   */
  function processMessages(msg: any, sendResponse: (response?: any) => void) {
    if (msg.command === "openNotificationBar") {
      if (inIframe) {
        return;
      }
      closeExistingAndOpenBar(msg.data.type, msg.data.typeData);
      sendResponse();
      return true;
    } else if (msg.command === "closeNotificationBar") {
      if (inIframe) {
        return;
      }
      closeBar(true);
      sendResponse();
      return true;
    } else if (msg.command === "adjustNotificationBar") {
      if (inIframe) {
        return;
      }
      adjustBar(msg.data);
      sendResponse();
      return true;
    } else if (msg.command === "notificationBarPageDetails") {
      // TODO: why do we not also check for inIframe here? Ask Kyle
      // See method collectPageDetails() for full itinerary that ends up here
      pageDetails.push(msg.data.details);
      watchForms(msg.data.forms);
      sendResponse();
      return true;
    }
    // TODO: could sendResponse() and return true be called here to reduce repetition?
    // only return true and send response when we have a matching command
  }
  //#endregion Message Processing

  /**
   * Observe the DOM for changes and collect page details if the DOM changes.
   */
  function observeDom() {
    const bodies = document.querySelectorAll("body");
    if (bodies && bodies.length > 0) {
      observer = new MutationObserver((mutations: MutationRecord[]) => {
        // If mutations are not found, or the page href has changed, return
        if (mutations == null || mutations.length === 0 || pageHref !== window.location.href) {
          return;
        }

        let doCollectPageDetails = false;

        for (let i = 0; i < mutations.length; i++) {
          const mutation: MutationRecord = mutations[i];

          // If there are no added nodes, continue to next mutation
          if (mutation.addedNodes == null || mutation.addedNodes.length === 0) {
            continue;
          }

          for (let j = 0; j < mutation.addedNodes.length; j++) {
            // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement
            const addedNode: any = mutation.addedNodes[j];

            // If the added node is null, continue to next added node
            if (addedNode == null) {
              continue;
            }

            // Get the lowercase tag name of the added node (if it exists)
            const tagName = addedNode.tagName != null ? addedNode.tagName.toLowerCase() : null;

            // If tag name exists & is a form &
            // (either the dataset is null or it does not have the custom data attribute: "data-bitwarden-watching"),
            // then collect page details and break
            // Note: The dataset read-only property of the HTMLElement interface provides
            // read/write access to custom data attributes (data-*) on elements
            // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset
            if (
              tagName != null &&
              tagName === "form" &&
              (addedNode.dataset == null || !addedNode.dataset.bitwardenWatching)
            ) {
              doCollectPageDetails = true;
              break;
            }

            // If tag name exists & is in the observeIgnoredElements set
            // or if the added node does not have the querySelectorAll method, continue to next added node
            // Note: querySelectorAll(...) exists on the Element & Document interfaces
            // It doesn't exist for nodes that are not elements, such as text nodes
            // Text Node examples: https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeName#example
            if (
              (tagName != null && observeIgnoredElements.has(tagName)) ||
              addedNode.querySelectorAll == null
            ) {
              continue;
            }

            // If the added node has any descendent form elements that are not yet being watched, collect page details and break
            const forms = addedNode.querySelectorAll("form:not([data-bitwarden-watching])");
            if (forms != null && forms.length > 0) {
              doCollectPageDetails = true;
              break;
            }
          }

          if (doCollectPageDetails) {
            break;
          }
        }

        // If page details need to be collected, clear any existing timeout and schedule a new one
        if (doCollectPageDetails) {
          if (domObservationCollectTimeout != null) {
            window.clearTimeout(domObservationCollectTimeout);
          }

          // The timeout is used to avoid collecting page details too often while also
          // giving the DOM time to settle down after a change (ex: multi-part forms being rendered)
          domObservationCollectTimeout = window.setTimeout(collectPageDetails, 1000);
        }
      });

      // Watch all mutations to the body element and all of its children & descendants
      observer.observe(bodies[0], { childList: true, subtree: true });
    }
  }

  //#region Page Detail Collection Methods
  /**
   * Schedules a call to the `collectPageDetailsIfNeeded` method with a timeout of 1 second.
   * If there is an existing timeout, it is cleared.
   */
  function collectPageDetailsIfNeededWithTimeout() {
    if (collectIfNeededTimeout != null) {
      window.clearTimeout(collectIfNeededTimeout);
    }
    collectIfNeededTimeout = window.setTimeout(collectPageDetailsIfNeeded, 1000);
  }

  /**
   * Collects information about the page if needed (if the page has changed)
   * and schedules a call to itself again in 1 second.
   */
  function collectPageDetailsIfNeeded() {
    // On first load or any time the page changes, we need to collect the page details
    if (pageHref !== window.location.href) {
      // update href
      pageHref = window.location.href;
      if (observer) {
        // reset existing DOM mutation observer so it can listen for changes to the new page body
        observer.disconnect();
        observer = null;
      }

      collectPageDetails();

      if (observeDomTimeout != null) {
        window.clearTimeout(observeDomTimeout);
      }
      // Start observing the DOM
      // TODO: why 1 second delay here?
      observeDomTimeout = window.setTimeout(observeDom, 1000);
    }

    // Page has not changed
    // Check again in 1 second (but clear any existing timeout first)
    if (collectIfNeededTimeout != null) {
      window.clearTimeout(collectIfNeededTimeout);
    }
    collectIfNeededTimeout = window.setTimeout(collectPageDetailsIfNeeded, 1000);
  }

  /** *
   * Tell the background script to collect the page details.
   *
   * (1) Sends a message with command `bgCollectPageDetails` to `runtime.background.ts : processMessage(...)`
   *
   * (2) `runtime.background.ts : processMessage(...)` calls
   * `main.background.ts : collectPageDetailsForContentScript`
   *
   * (3) `main.background.ts : collectPageDetailsForContentScript`
   * sends a message with command `collectPageDetails` to the `autofill.js` content script
   *
   * (4) `autofill.js` content script runs a `collect(document)` method.
   * The result is sent via message with command `collectPageDetailsResponse` to `notification.background.ts : processMessage(...)`
   *
   * (5) `notification.background.ts : processMessage(...)` gathers forms with password fields and passes them and the page details
   * via message with command `notificationBarPageDetails` back to the `processMessages` method in this content script.
   *
   * */
  function collectPageDetails() {
    sendPlatformMessage({
      command: "bgCollectPageDetails",
      sender: "notificationBar",
    });
  }

  //#endregion Page Detail Collection Methods

  function watchForms(forms: any[]) {
    if (forms == null || forms.length === 0) {
      return;
    }

    forms.forEach((f: any) => {
      const formId: string = f.form != null ? f.form.htmlID : null;
      let formEl: HTMLFormElement = null;
      if (formId != null && formId !== "") {
        formEl = document.getElementById(formId) as HTMLFormElement;
      }

      if (formEl == null) {
        const index = parseInt(f.form.opid.split("__")[2], null);
        formEl = document.getElementsByTagName("form")[index];
      }

      if (formEl != null && formEl.dataset.bitwardenWatching !== "1") {
        const formDataObj: any = {
          data: f,
          formEl: formEl,
          usernameEl: null,
          passwordEl: null,
          passwordEls: null,
        };
        locateFields(formDataObj);
        formData.push(formDataObj);
        listen(formEl);
        formEl.dataset.bitwardenWatching = "1";
      }
    });
  }

  function listen(form: HTMLFormElement) {
    form.removeEventListener("submit", formSubmitted, false);
    form.addEventListener("submit", formSubmitted, false);
    const submitButton = getSubmitButton(form, logInButtonNames);
    if (submitButton != null) {
      submitButton.removeEventListener("click", formSubmitted, false);
      submitButton.addEventListener("click", formSubmitted, false);
    }
  }

  function locateFields(formDataObj: any) {
    const inputs = Array.from(document.getElementsByTagName("input"));
    formDataObj.usernameEl = locateField(formDataObj.formEl, formDataObj.data.username, inputs);
    if (formDataObj.usernameEl != null && formDataObj.data.password != null) {
      formDataObj.passwordEl = locatePassword(
        formDataObj.formEl,
        formDataObj.data.password,
        inputs,
        true
      );
    } else if (formDataObj.data.passwords != null) {
      formDataObj.passwordEls = [];
      formDataObj.data.passwords.forEach((pData: any) => {
        const el = locatePassword(formDataObj.formEl, pData, inputs, false);
        if (el != null) {
          formDataObj.passwordEls.push(el);
        }
      });
      if (formDataObj.passwordEls.length === 0) {
        formDataObj.passwordEls = null;
      }
    }
  }

  function locatePassword(
    form: HTMLFormElement,
    passwordData: any,
    inputs: HTMLInputElement[],
    doLastFallback: boolean
  ) {
    let el = locateField(form, passwordData, inputs);
    if (el != null && el.type !== "password") {
      el = null;
    }
    if (doLastFallback && el == null) {
      el = form.querySelector('input[type="password"]');
    }
    return el;
  }

  function locateField(form: HTMLFormElement, fieldData: any, inputs: HTMLInputElement[]) {
    if (fieldData == null) {
      return;
    }
    let el: HTMLInputElement = null;
    if (fieldData.htmlID != null && fieldData.htmlID !== "") {
      try {
        el = form.querySelector("#" + fieldData.htmlID);
      } catch {
        // Ignore error, we perform fallbacks below.
      }
    }
    if (el == null && fieldData.htmlName != null && fieldData.htmlName !== "") {
      el = form.querySelector('input[name="' + fieldData.htmlName + '"]');
    }
    if (el == null && fieldData.elementNumber != null) {
      el = inputs[fieldData.elementNumber];
    }
    return el;
  }

  function formSubmitted(e: Event) {
    let form: HTMLFormElement = null;
    if (e.type === "click") {
      form = (e.target as HTMLElement).closest("form");
      if (form == null) {
        const parentModal = (e.target as HTMLElement).closest("div.modal");
        if (parentModal != null) {
          const modalForms = parentModal.querySelectorAll("form");
          if (modalForms.length === 1) {
            form = modalForms[0];
          }
        }
      }
    } else {
      form = e.target as HTMLFormElement;
    }

    if (form == null || form.dataset.bitwardenProcessed === "1") {
      return;
    }

    for (let i = 0; i < formData.length; i++) {
      if (formData[i].formEl !== form) {
        continue;
      }
      const disabledBoth = disabledChangedPasswordNotification && disabledAddLoginNotification;
      if (!disabledBoth && formData[i].usernameEl != null && formData[i].passwordEl != null) {
        const login: AddLoginRuntimeMessage = {
          username: formData[i].usernameEl.value,
          password: formData[i].passwordEl.value,
          url: document.URL,
        };

        if (
          login.username != null &&
          login.username !== "" &&
          login.password != null &&
          login.password !== ""
        ) {
          processedForm(form);
          sendPlatformMessage({
            command: "bgAddLogin",
            login: login,
          });
          break;
        }
      }
      if (!disabledChangedPasswordNotification && formData[i].passwordEls != null) {
        const passwords: string[] = formData[i].passwordEls
          .filter((el: HTMLInputElement) => el.value != null && el.value !== "")
          .map((el: HTMLInputElement) => el.value);

        let curPass: string = null;
        let newPass: string = null;
        let newPassOnly = false;
        if (formData[i].passwordEls.length === 3 && passwords.length === 3) {
          newPass = passwords[1];
          if (passwords[0] !== newPass && newPass === passwords[2]) {
            curPass = passwords[0];
          } else if (newPass !== passwords[2] && passwords[0] === newPass) {
            curPass = passwords[2];
          }
        } else if (formData[i].passwordEls.length === 2 && passwords.length === 2) {
          if (passwords[0] === passwords[1]) {
            newPassOnly = true;
            newPass = passwords[0];
            curPass = null;
          } else {
            const buttonText = getButtonText(getSubmitButton(form, changePasswordButtonNames));
            const matches = Array.from(changePasswordButtonContainsNames).filter(
              (n) => buttonText.indexOf(n) > -1
            );
            if (matches.length > 0) {
              curPass = passwords[0];
              newPass = passwords[1];
            }
          }
        }

        if ((newPass != null && curPass != null) || (newPassOnly && newPass != null)) {
          processedForm(form);

          const changePasswordRuntimeMessage: ChangePasswordRuntimeMessage = {
            newPassword: newPass,
            currentPassword: curPass,
            url: document.URL,
          };
          sendPlatformMessage({
            command: "bgChangedPassword",
            data: changePasswordRuntimeMessage,
          });
          break;
        }
      }
    }
  }

  function getSubmitButton(wrappingEl: HTMLElement, buttonNames: Set<string>) {
    if (wrappingEl == null) {
      return null;
    }

    const wrappingElIsForm = wrappingEl.tagName.toLowerCase() === "form";

    let submitButton = wrappingEl.querySelector(
      'input[type="submit"], input[type="image"], ' + 'button[type="submit"]'
    ) as HTMLElement;
    if (submitButton == null && wrappingElIsForm) {
      submitButton = wrappingEl.querySelector("button:not([type])");
      if (submitButton != null) {
        const buttonText = getButtonText(submitButton);
        if (buttonText != null && cancelButtonNames.has(buttonText.trim().toLowerCase())) {
          submitButton = null;
        }
      }
    }
    if (submitButton == null) {
      const possibleSubmitButtons = Array.from(
        wrappingEl.querySelectorAll(
          'a, span, button[type="button"], ' + 'input[type="button"], button:not([type])'
        )
      ) as HTMLElement[];
      let typelessButton: HTMLElement = null;
      possibleSubmitButtons.forEach((button) => {
        if (submitButton != null || button == null || button.tagName == null) {
          return;
        }
        const buttonText = getButtonText(button);
        if (buttonText != null) {
          if (
            typelessButton != null &&
            button.tagName.toLowerCase() === "button" &&
            button.getAttribute("type") == null &&
            !cancelButtonNames.has(buttonText.trim().toLowerCase())
          ) {
            typelessButton = button;
          } else if (buttonNames.has(buttonText.trim().toLowerCase())) {
            submitButton = button;
          }
        }
      });
      if (submitButton == null && typelessButton != null) {
        submitButton = typelessButton;
      }
    }
    if (submitButton == null && wrappingElIsForm) {
      // Maybe it's in a modal?
      const parentModal = wrappingEl.closest("div.modal") as HTMLElement;
      if (parentModal != null) {
        const modalForms = parentModal.querySelectorAll("form");
        if (modalForms.length === 1) {
          submitButton = getSubmitButton(parentModal, buttonNames);
        }
      }
    }
    return submitButton;
  }

  function getButtonText(button: HTMLElement) {
    let buttonText: string = null;
    if (button.tagName.toLowerCase() === "input") {
      buttonText = (button as HTMLInputElement).value;
    } else {
      buttonText = button.innerText;
    }
    return buttonText;
  }

  function processedForm(form: HTMLFormElement) {
    form.dataset.bitwardenProcessed = "1";
    window.setTimeout(() => {
      form.dataset.bitwardenProcessed = "0";
    }, 500);
  }

  //#region Notification Bar Functions (open, close, height adjustment, etc.)
  function closeExistingAndOpenBar(type: string, typeData: any) {
    const barQueryParams = {
      type,
      isVaultLocked: typeData.isVaultLocked,
      theme: typeData.theme,
    };
    const barQueryString = new URLSearchParams(barQueryParams).toString();
    const barPage = "notification/bar.html?" + barQueryString;

    const frame = document.getElementById("bit-notification-bar-iframe") as HTMLIFrameElement;
    if (frame != null && frame.src.indexOf(barPage) >= 0) {
      return;
    }

    closeBar(false);
    openBar(type, barPage);
  }

  function openBar(type: string, barPage: string) {
    barType = type;

    if (document.body == null) {
      return;
    }

    const barPageUrl: string = chrome.extension.getURL(barPage);

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "height: 42px; width: 100%; border: 0; min-height: initial;";
    iframe.id = "bit-notification-bar-iframe";
    iframe.src = barPageUrl;

    const frameDiv = document.createElement("div");
    frameDiv.setAttribute("aria-live", "polite");
    frameDiv.id = "bit-notification-bar";
    frameDiv.style.cssText =
      "height: 42px; width: 100%; top: 0; left: 0; padding: 0; position: fixed; " +
      "z-index: 2147483647; visibility: visible;";
    frameDiv.appendChild(iframe);
    document.body.appendChild(frameDiv);

    (iframe.contentWindow.location as any) = barPageUrl;

    const spacer = document.createElement("div");
    spacer.id = "bit-notification-bar-spacer";
    spacer.style.cssText = "height: 42px;";
    document.body.insertBefore(spacer, document.body.firstChild);
  }

  function closeBar(explicitClose: boolean) {
    const barEl = document.getElementById("bit-notification-bar");
    if (barEl != null) {
      barEl.parentElement.removeChild(barEl);
    }

    const spacerEl = document.getElementById("bit-notification-bar-spacer");
    if (spacerEl) {
      spacerEl.parentElement.removeChild(spacerEl);
    }

    if (!explicitClose) {
      return;
    }

    switch (barType) {
      case "add":
        sendPlatformMessage({
          command: "bgAddClose",
        });
        break;
      case "change":
        sendPlatformMessage({
          command: "bgChangeClose",
        });
        break;
      default:
        break;
    }
  }

  function adjustBar(data: any) {
    if (data != null && data.height !== 42) {
      const newHeight = data.height + "px";
      doHeightAdjustment("bit-notification-bar-iframe", newHeight);
      doHeightAdjustment("bit-notification-bar", newHeight);
      doHeightAdjustment("bit-notification-bar-spacer", newHeight);
    }
  }

  function doHeightAdjustment(elId: string, heightStyle: string) {
    const el = document.getElementById(elId);
    if (el != null) {
      el.style.height = heightStyle;
    }
  }
  //#endregion Notification Bar Functions (open, close, height adjustment, etc.)

  //#region Helper Functions
  function sendPlatformMessage(msg: any) {
    chrome.runtime.sendMessage(msg);
  }

  // TODO: don't we already have a function for this elsewhere?
  function isInIframe() {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }
  //#endregion Helper Functions
});
