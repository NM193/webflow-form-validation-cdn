// Universal form validation for Webflow-like forms
// Opt-in per form via: data-form-validation="true"
// Error elements mapped via: data-error-text="<normalized-key>"

;(function () {
  /**
   * Normalize a key so that different naming styles still match.
   * Example:
   *  "Last-Name", "last_name", "LAST NAME" -> "lastname"
   */
  function normalizeKey(str) {
    return (str || '')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Get a logical key for a field based on name / id / data-name
   */
  function getFieldKey(field) {
    var raw =
      field.getAttribute('name') ||
      field.getAttribute('id') ||
      field.getAttribute('data-name');
    return normalizeKey(raw);
  }

  /**
   * Build a map of error elements for a form: normalizedKey -> element
   */
  function buildErrorMap(form) {
    var map = {};
    var errorEls = form.querySelectorAll('[data-error-text]');

    errorEls.forEach(function (el) {
      var raw = el.getAttribute('data-error-text');
      var key = normalizeKey(raw);
      if (!key) return;
      // If duplicate keys exist, keep the first one
      if (!map[key]) {
        map[key] = el;
      }
      // Ensure errors are hidden initially
      el.classList.remove('is-visible');
    });

    return map;
  }

  /**
   * Show or hide error UI for a field.
   * Uses:
   *  - the default error text in the error element for "required" errors
   *  - the optional data-second-error on the field for "format" errors
   */
  function setFieldErrorState(field, errorEl, hasError, reason) {
    if (!errorEl) {
      // Still toggle field styling even if there is no error element
      if (hasError) {
        field.classList.add('is-invalid');
      } else {
        field.classList.remove('is-invalid');
      }
      return;
    }

    // Remember the original/default message once
    if (!errorEl.dataset.defaultMessage) {
      errorEl.dataset.defaultMessage = errorEl.textContent || '';
    }

    if (hasError) {
      field.classList.add('is-invalid');
      errorEl.classList.add('is-visible');

      // Decide which message to show
      if (reason === 'format' && field.hasAttribute('data-second-error')) {
        errorEl.textContent = field.getAttribute('data-second-error');
      } else {
        // Required or generic error → use default message
        errorEl.textContent = errorEl.dataset.defaultMessage;
      }
    } else {
      field.classList.remove('is-invalid');
      errorEl.classList.remove('is-visible');
      // Restore default message when clearing errors
      errorEl.textContent = errorEl.dataset.defaultMessage;
    }
  }

  /**
   * Validate a single field according to basic HTML attributes and return:
   * { valid: boolean, reason: 'required' | 'format' | null }
   */
  function validateField(field, errorEl) {
    var type = (field.getAttribute('type') || '').toLowerCase();
    var tag = field.tagName.toLowerCase();
    var value = (field.value || '').trim();

    // Determine "required":
    // - native required attribute
    // - OR an associated error element (common in your setup where each field has "This field is required")
    var isRequired =
      field.hasAttribute('required') ||
      !!errorEl;

    // Special handling for checkboxes and radios
    if (type === 'checkbox' || type === 'radio') {
      if (!isRequired) {
        return { valid: true, reason: null };
      }
      var checked = field.checked;
      return { valid: !!checked, reason: checked ? null : 'required' };
    }

    // If empty and not required → valid, no further checks
    if (!value && !isRequired) {
      return { valid: true, reason: null };
    }

    // If required and empty → invalid
    if (isRequired && !value) {
      return { valid: false, reason: 'required' };
    }

    // Type-specific checks
    if (type === 'tel') {
      // Allow only digits and "+" (and require at least one digit)
      var phonePattern = /^(?=.*\d)[0-9+]+$/;
      if (!phonePattern.test(value)) {
        return { valid: false, reason: 'format' };
      }
    }

    if (type === 'email') {
      // Basic email pattern (not perfect, but good enough for front-end)
      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(value)) {
        return { valid: false, reason: 'format' };
      }

      // Optional: business-only emails via data-business-email-only="true"
      if (field.hasAttribute('data-business-email-only')) {
        var atIndex = value.lastIndexOf('@');
        if (atIndex === -1) {
          return { valid: false, reason: 'format' };
        }
        var domain = value.slice(atIndex + 1).toLowerCase();
        // Common free email providers to block
        var freeDomains = [
          'gmail.com',
          'googlemail.com',
          'yahoo.com',
          'yahoo.co.uk',
          'hotmail.com',
          'outlook.com',
          'outlook.co.uk',
          'live.com',
          'msn.com',
          'icloud.com',
          'me.com',
          'mac.com',
          'aol.com',
          'protonmail.com',
          'pm.me',
          'yandex.com',
          'gmx.com',
          'mail.com',
          'zoho.com'
        ];
        if (freeDomains.indexOf(domain) !== -1) {
          return { valid: false, reason: 'format' };
        }
      }
    }

    if (type === 'url') {
      // Require something that looks like a real domain, with optional protocol
      var urlPattern = /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i;
      if (!urlPattern.test(value)) {
        return { valid: false, reason: 'format' };
      }
    }

    if (type === 'number') {
      if (value === '') {
        return { valid: !isRequired, reason: null };
      }
      var num = Number(value);
      if (Number.isNaN(num)) {
        return { valid: false, reason: 'format' };
      }
      var minAttr = field.getAttribute('min');
      var maxAttr = field.getAttribute('max');
      if (minAttr !== null && num < Number(minAttr)) {
        return { valid: false, reason: 'format' };
      }
      if (maxAttr !== null && num > Number(maxAttr)) {
        return { valid: false, reason: 'format' };
      }
    }

    // Generic length checks
    var minLengthAttr = field.getAttribute('minlength');
    var maxLengthAttr = field.getAttribute('maxlength');
    if (minLengthAttr !== null && value.length < Number(minLengthAttr)) {
      return { valid: false, reason: 'format' };
    }
    // For maxlength we usually rely on browser enforcing, but still check
    if (maxLengthAttr !== null && value.length > Number(maxLengthAttr)) {
      return { valid: false, reason: 'format' };
    }

    // Pattern attribute
    var patternAttr = field.getAttribute('pattern');
    if (patternAttr) {
      try {
        var re = new RegExp(patternAttr);
        if (!re.test(value)) {
          return { valid: false, reason: 'format' };
        }
      } catch (e) {
        // If pattern is invalid, ignore it
      }
    }

    return { valid: true, reason: null };
  }

  /**
   * Attach validation behaviour to a single form
   */
  function setupForm(form) {
    // Disable native browser / Webflow HTML5 validation UI.
    // We will handle all error display ourselves.
    form.setAttribute('novalidate', 'novalidate');

    var errorMap = buildErrorMap(form);
    var fields = Array.prototype.slice.call(
      form.querySelectorAll('input, textarea, select')
    );

    // Optional "gate" buttons: custom elements that should behave like submit
    // buttons while still going through our validation and submit logic.
    // Support both Webflow custom attribute "gate-btn" and data-gate-btn.
    var gateButtons = form.querySelectorAll('[data-gate-btn], [gate-btn]');
    gateButtons.forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();

        // Prefer requestSubmit so the browser triggers the normal submit flow
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          // Fallbacks for older browsers
          var nativeSubmit =
            form.querySelector('button[type="submit"], input[type="submit"]');
          if (nativeSubmit && typeof nativeSubmit.click === 'function') {
            nativeSubmit.click();
          } else {
            form.dispatchEvent(
              new Event('submit', { cancelable: true, bubbles: true })
            );
          }
        }
      });
    });

    // Per-field handler
    // context: 'input' | 'blur' | 'change' | 'submit' | 'other'
    function handleField(field, context) {
      context = context || 'other';
      var key = getFieldKey(field);
      var errorEl = key ? errorMap[key] : null;
      var result = validateField(field, errorEl);
      var hasErrorToShow = !result.valid;

      // For checkboxes / radios, only show the error on submit.
      // We still validate them on blur/change/input for submit logic,
      // but we don't visually show the error until the user actually submits.
      var fieldType = (field.getAttribute('type') || '').toLowerCase();
      if (
        (fieldType === 'checkbox' || fieldType === 'radio') &&
        context !== 'submit'
      ) {
        hasErrorToShow = false;
      }

      // UX rule: for input/blur/change, if the field is currently empty, don't show the error yet.
      // We still treat it as invalid internally (for submit), but we hide the visual error.
      if (context === 'input' || context === 'blur' || context === 'change') {
        var currentValue = (field.value || '').trim();
        if (!currentValue) {
          hasErrorToShow = false;
        }
      }

      setFieldErrorState(field, errorEl, hasErrorToShow, result.reason);
      return result.valid;
    }

    // Validate all fields in the form; return true if all valid
    function validateForm() {
      var allValid = true;
      fields.forEach(function (field) {
        // Skip buttons
        if (field.type === 'submit' || field.type === 'button') return;
        var valid = handleField(field, 'submit');
        if (!valid) {
          allValid = false;
        }
      });
      return allValid;
    }

    // Validate on blur / change for better UX
    fields.forEach(function (field) {
      if (field.type === 'submit' || field.type === 'button') return;

      field.addEventListener('blur', function () {
        handleField(field, 'blur');
      });

      field.addEventListener('input', function () {
        // Live feedback while typing for text-like inputs
        var type = (field.getAttribute('type') || '').toLowerCase();
        var tag = field.tagName.toLowerCase();
        if (
          tag === 'input' &&
          (type === 'text' ||
            type === 'email' ||
            type === 'tel' ||
            type === 'url' ||
            type === 'password' ||
            type === '' ||
            type === 'search') ||
          tag === 'textarea'
        ) {
          handleField(field, 'input');
        }
      });

      field.addEventListener('change', function () {
        handleField(field, 'change');
      });
    });

    // Intercept submit
    form.addEventListener('submit', function (event) {
      var isValid = validateForm();
      if (!isValid) {
        event.preventDefault();
        event.stopPropagation();

        // Optionally, focus the first invalid field
        var firstInvalid = fields.find(function (field) {
          return field.classList.contains('is-invalid');
        });
        if (firstInvalid && typeof firstInvalid.focus === 'function') {
          firstInvalid.focus();
        }
      }
    });
  }

  /**
   * Initialize all forms with data-form-validation="true"
   */
  function init() {
    var forms = document.querySelectorAll('form[data-form-validation="true"]');
    forms.forEach(function (form) {
      setupForm(form);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


