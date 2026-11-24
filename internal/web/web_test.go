package web

import (
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func get(t *testing.T, path string) *http.Response {
	t.Helper()
	rec := httptest.NewRecorder()
	Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec.Result()
}

func body(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer func() { _ = resp.Body.Close() }()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestHealthz(t *testing.T) {
	resp := get(t, "/healthz")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if got := body(t, resp); got != "ok\n" {
		t.Fatalf("body = %q", got)
	}
}

func TestSecurityHeaders(t *testing.T) {
	resp := get(t, "/")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	want := map[string]string{
		"X-Content-Type-Options":     "nosniff",
		"Referrer-Policy":            "no-referrer",
		"Cache-Control":              "no-cache",
		"Cross-Origin-Opener-Policy": "same-origin",
	}
	for k, v := range want {
		if got := resp.Header.Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
	csp := resp.Header.Get("Content-Security-Policy")
	for _, directive := range []string{
		"default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
	} {
		if !strings.Contains(csp, directive) {
			t.Errorf("CSP lacks %q: %s", directive, csp)
		}
	}
	if strings.Contains(csp, "script-src 'self' 'unsafe") || strings.Contains(csp, "unsafe-eval") {
		t.Errorf("CSP allows unsafe script: %s", csp)
	}
}

func TestIndexHasNoInlineScriptOrHandlers(t *testing.T) {
	html := body(t, get(t, "/"))
	inline := regexp.MustCompile(`(?is)<script(?:\s[^>]*)?>`)
	for _, tag := range inline.FindAllString(html, -1) {
		if !strings.Contains(tag, "src=") {
			t.Errorf("inline script tag: %s", tag)
		}
	}
	if m := regexp.MustCompile(`(?i)\son[a-z]+\s*=`).FindString(html); m != "" {
		t.Errorf("inline event handler: %q", m)
	}
	if strings.Contains(html, "<style") {
		t.Error("index.html has an inline style element")
	}
}

// Every local file the page references must be in the embedded tree, so a bundle step that was skipped
// shows up here instead of as a blank page.
func TestReferencedFilesAreEmbedded(t *testing.T) {
	html := body(t, get(t, "/"))
	refs := regexp.MustCompile(`(?:src|href)="(/[^"#?]+)"`).FindAllStringSubmatch(html, -1)
	if len(refs) == 0 {
		t.Fatal("index.html references no local files")
	}
	for _, m := range refs {
		name := strings.TrimPrefix(m[1], "/")
		if _, err := fs.Stat(files, "static/"+name); err != nil {
			t.Errorf("%s is referenced but not embedded: %v (run scripts/bundle.sh)", m[1], err)
		}
	}
}

func TestUnknownPathIs404(t *testing.T) {
	if got := get(t, "/nope.txt").StatusCode; got != http.StatusNotFound {
		t.Fatalf("status = %d", got)
	}
}

func TestOnlyGetAndHeadAreAllowed(t *testing.T) {
	for _, path := range []string{"/", "/healthz", "/app.js"} {
		for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch} {
			rec := httptest.NewRecorder()
			Routes().ServeHTTP(rec, httptest.NewRequest(method, path, nil))
			if rec.Code != http.StatusMethodNotAllowed {
				t.Errorf("%s %s: status = %d", method, path, rec.Code)
			}
			if got := rec.Header().Get("Allow"); got != "GET, HEAD" {
				t.Errorf("%s %s: Allow = %q", method, path, got)
			}
		}
	}
	rec := httptest.NewRecorder()
	Routes().ServeHTTP(rec, httptest.NewRequest(http.MethodHead, "/", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("HEAD /: status = %d", rec.Code)
	}
}
