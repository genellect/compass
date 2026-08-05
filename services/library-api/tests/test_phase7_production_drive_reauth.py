import os
import subprocess

import pytest

from scripts import phase7_production_drive_reauth_server as helper


def test_adc_refresh_ignores_existing_gcloud_token_override(monkeypatch) -> None:
    monkeypatch.setenv("CLOUDSDK_AUTH_ACCESS_TOKEN", "expired-token")
    observed: dict[str, object] = {}

    def fake_run(arguments, **kwargs):
        observed["arguments"] = arguments
        observed["environment"] = kwargs["env"]
        return subprocess.CompletedProcess(arguments, 0, "fresh-adc-token\n", "")

    monkeypatch.setattr(helper.subprocess, "run", fake_run)

    token = helper._refresh_gcloud_adc_access_token("fake-gcloud")

    assert token == "fresh-adc-token"
    assert observed["arguments"] == [
        "fake-gcloud",
        "auth",
        "application-default",
        "print-access-token",
    ]
    assert "CLOUDSDK_AUTH_ACCESS_TOKEN" not in observed["environment"]
    assert os.environ["CLOUDSDK_AUTH_ACCESS_TOKEN"] == "expired-token"


@pytest.mark.parametrize(
    ("returncode", "stdout"),
    ((1, "sensitive-command-output"), (0, ""), (0, "invalid token")),
)
def test_adc_refresh_failure_is_sanitized(
    monkeypatch,
    returncode: int,
    stdout: str,
) -> None:
    def fake_run(arguments, **_kwargs):
        return subprocess.CompletedProcess(
            arguments,
            returncode,
            stdout,
            "sensitive-command-error",
        )

    monkeypatch.setattr(helper.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="^ADC token refresh failed\\.$") as caught:
        helper._refresh_gcloud_adc_access_token("fake-gcloud")

    if stdout:
        assert stdout not in str(caught.value)
    assert "sensitive-command-error" not in str(caught.value)


def test_secret_write_uses_fresh_adc_and_restores_previous_override(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CLOUDSDK_AUTH_ACCESS_TOKEN", "startup-token")
    monkeypatch.setattr(
        helper,
        "_refresh_gcloud_adc_access_token",
        lambda _executable: "fresh-adc-token",
    )

    class FakeSink:
        def add_version(self, secret_id: str, value: str) -> int:
            assert secret_id == helper.REFRESH_TOKEN_SECRET
            assert value == "new-drive-refresh-token"
            assert os.environ["CLOUDSDK_AUTH_ACCESS_TOKEN"] == "fresh-adc-token"
            return 2

    version = helper._add_refresh_token_version_with_fresh_adc(
        FakeSink(),
        "fake-gcloud",
        "new-drive-refresh-token",
    )

    assert version == 2
    assert os.environ["CLOUDSDK_AUTH_ACCESS_TOKEN"] == "startup-token"


def test_secret_write_restores_environment_after_sink_failure(monkeypatch) -> None:
    monkeypatch.delenv("CLOUDSDK_AUTH_ACCESS_TOKEN", raising=False)
    monkeypatch.setattr(
        helper,
        "_refresh_gcloud_adc_access_token",
        lambda _executable: "fresh-adc-token",
    )

    class FailingSink:
        def add_version(self, _secret_id: str, _value: str) -> int:
            assert os.environ["CLOUDSDK_AUTH_ACCESS_TOKEN"] == "fresh-adc-token"
            raise helper.SecretSinkError("synthetic failure")

    with pytest.raises(helper.SecretSinkError, match="synthetic failure"):
        helper._add_refresh_token_version_with_fresh_adc(
            FailingSink(),
            "fake-gcloud",
            "new-drive-refresh-token",
        )

    assert "CLOUDSDK_AUTH_ACCESS_TOKEN" not in os.environ
