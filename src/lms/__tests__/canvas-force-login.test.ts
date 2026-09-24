import type { NextFunction, Request, Response } from 'express';
import { forceCanvasLogin, withForceLogin } from '../canvas-force-login';

describe('withForceLogin', () => {
    it('asks Canvas to show its sign-in step on the authorize redirect, keeping every other parameter', () => {
        const url = new URL(withForceLogin('https://canvas.example.edu/login/oauth2/auth?client_id=1&state=abc&scope=a%20b'));
        expect(url.searchParams.get('force_login')).toBe('1');
        expect(url.searchParams.get('client_id')).toBe('1');
        expect(url.searchParams.get('state')).toBe('abc');
        expect(url.searchParams.get('scope')).toBe('a b');
    });

    it('leaves every other redirect alone', () => {
        expect(withForceLogin('/writing-feedback?wfSubmission=1')).toBe('/writing-feedback?wfSubmission=1');
        expect(withForceLogin('https://canvas.example.edu/courses/1')).toBe('https://canvas.example.edu/courses/1');
    });
});

describe('forceCanvasLogin', () => {
    it('amends the redirect the login handler sends, then hands on to it', () => {
        const redirect = jest.fn();
        const res = { redirect } as unknown as Response;
        const next = jest.fn() as unknown as NextFunction;

        forceCanvasLogin({} as Request, res, next);
        expect(next).toHaveBeenCalled();

        res.redirect('https://canvas.example.edu/login/oauth2/auth?state=s');
        expect(redirect.mock.calls[0][0]).toContain('force_login=1');
    });
});
