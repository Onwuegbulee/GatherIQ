import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.rate_limit import reset_rate_limits
from app.setup import create_church_with_admin

TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    reset_rate_limits()
    yield
    Base.metadata.drop_all(bind=engine)
    reset_rate_limits()


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def church_a(db_session):
    return create_church_with_admin(
        db_session,
        church_name="Grace Church A",
        church_location="Lagos",
        full_name="Admin A",
        email="admin.a@church.org",
        password="password123",
        role="admin",
    )


@pytest.fixture
def church_b(db_session):
    return create_church_with_admin(
        db_session,
        church_name="Faith Church B",
        church_location="Abuja",
        full_name="Admin B",
        email="admin.b@church.org",
        password="password456",
        role="admin",
    )


@pytest.fixture
def auth_headers_a(client, church_a):
    res = client.post(
        "/api/auth/login",
        json={"email": "admin.a@church.org", "password": "password123"},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_b(client, church_b):
    res = client.post(
        "/api/auth/login",
        json={"email": "admin.b@church.org", "password": "password456"},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
