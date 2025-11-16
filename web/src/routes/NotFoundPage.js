import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useRouteError } from 'react-router-dom';
export const NotFoundPage = () => {
    const error = useRouteError();
    console.error(error);
    return (_jsxs("div", { className: "banner", style: { borderColor: '#ff5f5f', color: '#ffbfbf' }, children: [_jsx("h1", { children: "Something went sideways" }), _jsx("p", { children: "We couldn\u2019t find that view. Head back home and try again." }), _jsx(Link, { to: "/", className: "btn", children: "Go home" })] }));
};
