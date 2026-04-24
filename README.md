# Endpoint Rejector

Chrome extension that intercepts fetch/XHR requests matching URL patterns and returns custom HTTP error responses.

## Install

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this project folder

## Usage

1. Click the extension icon in the toolbar
2. Enter a URL pattern (substring match, `*` as wildcard) and pick a status code
3. Click **Add**
4. Reload the page — matching requests will be rejected with the chosen status code

Rules can be toggled, edited, or deleted from the popup. Use **Clear all** to remove everything.

Console output at startup shows you list of all rejected endpoints along with their status 👇

<img width="601" height="125" alt="image" src="https://github.com/user-attachments/assets/779f6ad8-bc24-4f4e-9954-5d6abb9fac7e" />

## Examples

| Pattern | Status | Effect |
|---------|--------|--------|
| `/api/users` | 500 | Simulate a server error on any request containing `/api/users` |
| `/auth/login` | 401 | Test unauthorized handling on login |
| `/api/*/comments` | 503 | Block comments endpoints for any resource |
| `graphql` | 504 | Timeout all GraphQL requests |
| `/checkout` | 403 | Simulate forbidden access to checkout flow |
