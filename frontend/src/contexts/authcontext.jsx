import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();
const AUTH_STORAGE_KEYS = ['user_id', 'username', 'user_email', 'preferred_name'];

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Check if user is logged in on app start
    useEffect(() => {
        checkAuthStatus();
    }, []);

    const checkAuthStatus = () => {
        try {
            const userId = localStorage.getItem('user_id');
            const username = localStorage.getItem('username');
            const email = localStorage.getItem('user_email');
            
            if (userId && email) {
                setUser({
                    user_id: userId,
                    username: username || email,
                    email: email
                });
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const login = (userData) => {
        setUser(userData);
        localStorage.setItem('user_id', userData.user_id);
        localStorage.setItem('username', userData.username || userData.email);
        localStorage.setItem('user_email', userData.email);
    };

    const logout = () => {
        setUser(null);
        AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    };

    const value = {
        user,
        login,
        logout,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

// This module intentionally exports the provider and its matching hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
