*** Settings ***
Documentation       Global variables and environment configurations for Por-Chai test automation.

*** Variables ***
# Environment & Base URLs
${BASE_URL}             http://localhost:3004
${API_BASE_URL}         ${BASE_URL}/api
${LIFF_URL}             ${BASE_URL}/app
${DEV_PORT}             3004
${HEADLESS}             False

# Mock / Test User Identifiers
${TEST_USER_ID_A}       U_test_user_alpha_001
${TEST_USER_ID_B}       U_test_user_beta_002
${TEST_BEARER_TOKEN_A}  Bearer mock_token_alpha
${TEST_BEARER_TOKEN_B}  Bearer mock_token_beta

# Mock LIFF ID & App State
${MOCK_LIFF_ID}         1650000000-xxxxxxx
${LINE_CHANNEL_SECRET}  test_channel_secret_key_porchai

# Standard HTTP Headers
&{AUTH_HEADERS_USER_A}  Authorization=${TEST_BEARER_TOKEN_A}    Content-Type=application/json
&{AUTH_HEADERS_USER_B}  Authorization=${TEST_BEARER_TOKEN_B}    Content-Type=application/json

# Calculation Thresholds (Satang units)
${QUARTER_BAHT_SATANG}  25
${ONE_BAHT_SATANG}      100

