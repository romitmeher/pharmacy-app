from scripts.demo_credentials import credential_path, get_demo_credentials, new_credentials, save_credentials


def test_demo_credentials_persist_and_are_isolated(tmp_path):
    first = get_demo_credentials(tmp_path / "first")
    assert first == get_demo_credentials(tmp_path / "first")
    assert first != get_demo_credentials(tmp_path / "second")
    assert len(first["password"]) >= 24
    assert len(first["secret_key"]) >= 48


def test_rotating_demo_credentials_replaces_both_values(tmp_path):
    original = get_demo_credentials(tmp_path)
    replacement = new_credentials()
    save_credentials(replacement, tmp_path)
    assert get_demo_credentials(tmp_path) == replacement
    assert original["password"] != replacement["password"]
    assert original["secret_key"] != replacement["secret_key"]
    assert credential_path(tmp_path).is_file()
